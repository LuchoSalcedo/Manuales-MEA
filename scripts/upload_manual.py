#!/usr/bin/env python3
"""
Script para subir y procesar manuales de forma independiente.
El manual quedará disponible en la aplicación web una vez procesado.

Uso:
    python upload_manual.py path/to/manual.pdf
    python upload_manual.py path/to/manual.pdf --name "Nombre del Manual"
    python upload_manual.py path/to/manual.pdf --pages 1-50  # Procesar solo algunas páginas
    python upload_manual.py path/to/manual.pdf --skip-ocr    # Solo páginas digitales (rápido)

Requisitos:
    - Variables de entorno en .env (SUPABASE_URL, SUPABASE_SERVICE_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY)
    - Dependencias: pip install pymupdf anthropic openai tiktoken supabase python-dotenv
"""

import os
import sys
import json
import base64
import argparse
import uuid
import re
from pathlib import Path
from datetime import datetime
from dotenv import load_dotenv

import fitz  # pymupdf
import tiktoken
from openai import OpenAI
from supabase import create_client
import anthropic

# Cargar variables de entorno
env_path = Path(__file__).parent.parent / ".env"
load_dotenv(env_path)

# Configuración
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")

# Parámetros de procesamiento
CHUNK_SIZE = 800  # tokens
CHUNK_OVERLAP = 100  # tokens
MIN_TEXT_CHARS = 100  # mínimo para considerar página digital
EMBEDDING_MODEL = "text-embedding-ada-002"


def validate_env(need_anthropic=True):
    """Valida que las variables de entorno estén configuradas."""
    missing = []
    if not SUPABASE_URL:
        missing.append("SUPABASE_URL")
    if not SUPABASE_SERVICE_KEY:
        missing.append("SUPABASE_SERVICE_KEY")
    if not OPENAI_API_KEY:
        missing.append("OPENAI_API_KEY")
    if need_anthropic and not ANTHROPIC_API_KEY:
        missing.append("ANTHROPIC_API_KEY")

    if missing:
        print(f"Error: Variables de entorno faltantes: {', '.join(missing)}")
        print("Configura estas variables en el archivo .env")
        sys.exit(1)


def detect_pdf_type(pdf_path: str) -> dict:
    """Detecta si el PDF es digital, escaneado o híbrido."""
    doc = fitz.open(pdf_path)
    total_pages = len(doc)

    digital_pages = []
    ocr_pages = []
    pages_with_images = 0

    for page_num in range(total_pages):
        page = doc[page_num]
        text = page.get_text().strip()
        images = page.get_images()

        has_enough_text = len(text) >= MIN_TEXT_CHARS
        has_images = len(images) > 0

        if has_enough_text and not has_images:
            digital_pages.append(page_num)
        else:
            ocr_pages.append(page_num)
            if has_images:
                pages_with_images += 1

    doc.close()

    digital_ratio = len(digital_pages) / total_pages if total_pages > 0 else 0

    if digital_ratio >= 0.9:
        pdf_type = "digital"
    elif digital_ratio <= 0.1:
        pdf_type = "scanned"
    else:
        pdf_type = "hybrid"

    return {
        "type": pdf_type,
        "digital_pages": digital_pages,
        "ocr_pages": ocr_pages,
        "total_pages": total_pages,
        "pages_with_images": pages_with_images
    }


def detect_section_from_text(text: str) -> str | None:
    """Detecta el nombre de sección basándose en patrones comunes."""
    lines = text.strip().split('\n')
    if not lines:
        return None

    section_patterns = [
        r'^(CHAPTER|SECTION|PART)\s+\d+[\s:\-]+(.+)$',
        r'^(CAPÍTULO|SECCIÓN|PARTE)\s+\d+[\s:\-]+(.+)$',
        r'^(\d+\.?\s+)?([A-Z][A-Z\s]+)$',
        r'^(TABLE OF CONTENTS|INDEX|INTRODUCTION|APPENDIX)',
        r'^(ÍNDICE|INTRODUCCIÓN|APÉNDICE)',
    ]

    for line in lines[:10]:
        line = line.strip()
        if not line:
            continue

        if line.isupper() and 5 <= len(line) <= 100:
            return line

        for pattern in section_patterns:
            match = re.match(pattern, line, re.IGNORECASE)
            if match:
                return line

    return None


def extract_text_direct(pdf_path: str, page_num: int) -> dict:
    """Extrae texto directamente de una página digital."""
    doc = fitz.open(pdf_path)
    page = doc[page_num]
    text = page.get_text()
    section = detect_section_from_text(text)
    doc.close()

    return {
        "content": text.strip(),
        "section": section
    }


def extract_page_as_image(pdf_path: str, page_num: int) -> bytes:
    """Extrae una página del PDF como imagen PNG."""
    doc = fitz.open(pdf_path)
    page = doc[page_num]
    mat = fitz.Matrix(2.0, 2.0)
    pix = page.get_pixmap(matrix=mat)
    img_bytes = pix.tobytes("png")
    doc.close()
    return img_bytes


def extract_text_with_claude(image_bytes: bytes, anthropic_client) -> dict:
    """Envía la imagen a Claude para extraer texto."""
    image_base64 = base64.standard_b64encode(image_bytes).decode("utf-8")

    message = anthropic_client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=4096,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": "image/png",
                            "data": image_base64,
                        },
                    },
                    {
                        "type": "text",
                        "text": """Analiza esta página de un manual técnico y extrae:
1. Todo el texto visible en la página
2. El nombre de la sección o capítulo si está visible

Responde en formato JSON exactamente así:
{
    "content": "texto completo extraído de la página",
    "section": "nombre de la sección o null si no hay"
}

Solo responde con el JSON, sin explicaciones adicionales."""
                    }
                ],
            }
        ],
    )

    response_text = message.content[0].text

    if response_text.startswith("```"):
        response_text = response_text.split("```")[1]
        if response_text.startswith("json"):
            response_text = response_text[4:]
    response_text = response_text.strip()

    try:
        result = json.loads(response_text)
    except json.JSONDecodeError:
        result = {"content": response_text, "section": None}

    return result


def count_tokens(text: str) -> int:
    """Cuenta los tokens de un texto."""
    encoding = tiktoken.encoding_for_model("gpt-3.5-turbo")
    return len(encoding.encode(text))


def split_text_into_chunks(text: str, page_number: int, section: str) -> list[dict]:
    """Divide el texto en chunks de tamaño apropiado."""
    encoding = tiktoken.encoding_for_model("gpt-3.5-turbo")
    tokens = encoding.encode(text)

    if len(tokens) <= CHUNK_SIZE:
        return [{
            "content": text,
            "page_number": page_number,
            "section": section
        }]

    chunks = []
    start = 0

    while start < len(tokens):
        end = start + CHUNK_SIZE
        chunk_tokens = tokens[start:end]
        chunk_text = encoding.decode(chunk_tokens)

        chunks.append({
            "content": chunk_text,
            "page_number": page_number,
            "section": section
        })

        start = end - CHUNK_OVERLAP

        if len(tokens) - start < CHUNK_OVERLAP:
            break

    return chunks


def parse_page_range(page_range: str, total_pages: int) -> list[int]:
    """Parsea un rango de páginas como '1-5' o '3'."""
    if not page_range:
        return list(range(total_pages))

    pages = []
    for part in page_range.split(","):
        part = part.strip()
        if "-" in part:
            start, end = part.split("-")
            start = max(1, int(start))
            end = min(int(end), total_pages)
            pages.extend(range(start - 1, end))
        else:
            page = int(part)
            if 1 <= page <= total_pages:
                pages.append(page - 1)

    return sorted(set(pages))


def upload_pdf_to_storage(supabase, pdf_path: Path, filename: str) -> str:
    """Sube el PDF a Supabase Storage y retorna la ruta."""
    storage_path = f"pdfs/{filename}"

    with open(pdf_path, "rb") as f:
        content = f.read()

    # Intentar subir (con upsert para sobrescribir si existe)
    try:
        supabase.storage.from_("manuals").upload(
            storage_path,
            content,
            {"content-type": "application/pdf", "upsert": "true"}
        )
        print(f"  PDF subido a Storage: {storage_path}")
    except Exception as e:
        # Si falla, intentar actualizar
        try:
            supabase.storage.from_("manuals").update(
                storage_path,
                content,
                {"content-type": "application/pdf"}
            )
            print(f"  PDF actualizado en Storage: {storage_path}")
        except Exception as e2:
            print(f"  Advertencia: No se pudo subir a Storage: {e2}")

    return storage_path


def create_manual_record(supabase, manual_name: str, original_filename: str, total_pages: int, pdf_type: str) -> str:
    """Crea un registro de manual en Supabase."""
    manual_id = str(uuid.uuid4())

    response = supabase.table("manuals").insert({
        "id": manual_id,
        "name": manual_name,
        "description": f"Procesado automáticamente ({pdf_type})",
        "original_filename": original_filename,
        "total_pages": total_pages,
        "processed": False
    }).execute()

    if response.data:
        print(f"  Manual creado con ID: {manual_id}")
        return manual_id
    else:
        print(f"Error al crear manual: {response}")
        sys.exit(1)


def generate_embeddings(chunks: list[dict], openai_client: OpenAI) -> list[dict]:
    """Genera embeddings para cada chunk."""
    print(f"\n[4/5] Generando embeddings para {len(chunks)} chunks...")

    batch_size = 100

    for i in range(0, len(chunks), batch_size):
        batch = chunks[i:i + batch_size]
        texts = [chunk["content"] for chunk in batch]

        print(f"  Batch {i // batch_size + 1}/{(len(chunks) - 1) // batch_size + 1}...", end=" ", flush=True)

        response = openai_client.embeddings.create(
            model=EMBEDDING_MODEL,
            input=texts
        )

        for j, embedding_data in enumerate(response.data):
            chunks[i + j]["embedding"] = embedding_data.embedding

        print("OK")

    return chunks


def save_chunks_to_supabase(supabase, chunks: list[dict], manual_id: str) -> int:
    """Guarda los chunks en Supabase."""
    print(f"\n[5/5] Guardando {len(chunks)} chunks en Supabase...")

    batch_size = 50
    total_saved = 0

    for i in range(0, len(chunks), batch_size):
        batch = chunks[i:i + batch_size]

        records = []
        for chunk in batch:
            records.append({
                "id": str(uuid.uuid4()),
                "manual_id": manual_id,
                "content": chunk["content"],
                "page_number": chunk["page_number"],
                "section": chunk["section"],
                "embedding": chunk["embedding"]
            })

        print(f"  Batch {i // batch_size + 1}/{(len(chunks) - 1) // batch_size + 1}...", end=" ", flush=True)

        response = supabase.table("chunks").insert(records).execute()

        if response.data:
            total_saved += len(response.data)
            print("OK")
        else:
            print(f"ERROR: {response}")

    return total_saved


def mark_manual_as_processed(supabase, manual_id: str):
    """Marca el manual como procesado."""
    supabase.table("manuals").update({
        "processed": True
    }).eq("id", manual_id).execute()


def upload_manual(pdf_path: str, manual_name: str = None, page_range: str = None, skip_ocr: bool = False):
    """Proceso completo de subida y procesamiento de un manual."""
    pdf_path = Path(pdf_path)

    if not pdf_path.exists():
        print(f"Error: No se encontró el archivo {pdf_path}")
        sys.exit(1)

    original_filename = pdf_path.name
    if not manual_name:
        manual_name = pdf_path.stem

    # Detectar tipo de PDF
    print(f"\n{'='*70}")
    print(f"SUBIDA DE MANUAL: {manual_name}")
    print(f"{'='*70}")
    print(f"\n[1/5] Analizando PDF...")

    pdf_info = detect_pdf_type(str(pdf_path))
    total_pages = pdf_info["total_pages"]
    pdf_type = pdf_info["type"]

    print(f"  Tipo: {pdf_type.upper()}")
    print(f"  Total páginas: {total_pages}")
    print(f"  Páginas digitales: {len(pdf_info['digital_pages'])}")
    print(f"  Páginas OCR: {len(pdf_info['ocr_pages'])}")

    # Validar entorno
    need_anthropic = len(pdf_info['ocr_pages']) > 0 and not skip_ocr
    validate_env(need_anthropic)

    # Conectar servicios
    supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    openai_client = OpenAI(api_key=OPENAI_API_KEY)
    anthropic_client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY) if need_anthropic else None

    # Subir PDF a Storage
    print(f"\n[2/5] Subiendo PDF a Storage...")
    upload_pdf_to_storage(supabase, pdf_path, original_filename)

    # Crear registro del manual
    manual_id = create_manual_record(supabase, manual_name, original_filename, total_pages, pdf_type)

    # Determinar páginas a procesar
    pages_to_process = parse_page_range(page_range, total_pages)
    digital_pages_set = set(pdf_info["digital_pages"])

    if skip_ocr:
        # Solo procesar páginas digitales
        pages_to_process = [p for p in pages_to_process if p in digital_pages_set]
        print(f"\n[3/5] Extrayendo texto (solo digitales: {len(pages_to_process)} páginas)...")
    else:
        print(f"\n[3/5] Extrayendo texto ({len(pages_to_process)} páginas)...")

    # Extraer texto de cada página
    all_pages = []
    for i, page_num in enumerate(pages_to_process):
        is_digital = page_num in digital_pages_set
        method = "digital" if is_digital else "OCR"
        print(f"  [{i + 1}/{len(pages_to_process)}] Página {page_num + 1} ({method})...", end=" ", flush=True)

        try:
            if is_digital:
                extracted = extract_text_direct(str(pdf_path), page_num)
            else:
                image_bytes = extract_page_as_image(str(pdf_path), page_num)
                extracted = extract_text_with_claude(image_bytes, anthropic_client)

            all_pages.append({
                "page_number": page_num + 1,
                "content": extracted.get("content", ""),
                "section": extracted.get("section")
            })
            print("OK")

        except Exception as e:
            print(f"ERROR: {e}")
            all_pages.append({
                "page_number": page_num + 1,
                "content": "",
                "section": None
            })

    # Generar chunks
    print(f"\n  Generando chunks...")
    all_chunks = []
    for page in all_pages:
        if page["content"]:
            page_chunks = split_text_into_chunks(
                page["content"],
                page["page_number"],
                page["section"]
            )
            all_chunks.extend(page_chunks)

    print(f"  Total chunks: {len(all_chunks)}")

    if not all_chunks:
        print("\nAdvertencia: No se generaron chunks. El manual puede no tener texto extraíble.")
        mark_manual_as_processed(supabase, manual_id)
        return manual_id

    # Generar embeddings
    all_chunks = generate_embeddings(all_chunks, openai_client)

    # Guardar en Supabase
    saved = save_chunks_to_supabase(supabase, all_chunks, manual_id)

    # Marcar como procesado
    mark_manual_as_processed(supabase, manual_id)

    # Resumen
    print(f"\n{'='*70}")
    print(f"COMPLETADO!")
    print(f"{'='*70}")
    print(f"  Manual: {manual_name}")
    print(f"  ID: {manual_id}")
    print(f"  Páginas procesadas: {len(pages_to_process)}")
    print(f"  Chunks guardados: {saved}")
    print(f"\nEl manual ya está disponible en la aplicación web.")
    print(f"{'='*70}\n")

    return manual_id


def main():
    parser = argparse.ArgumentParser(
        description="Sube y procesa un manual PDF para la aplicación de Manuales MEA",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Ejemplos:
  python upload_manual.py manual.pdf
  python upload_manual.py manual.pdf --name "Manual de Operación"
  python upload_manual.py manual.pdf --pages 1-50
  python upload_manual.py manual.pdf --skip-ocr
        """
    )
    parser.add_argument("pdf", help="Ruta al archivo PDF")
    parser.add_argument("-n", "--name", help="Nombre del manual (por defecto usa el nombre del archivo)")
    parser.add_argument("-p", "--pages", help="Rango de páginas a procesar (ej: '1-50', '1,3,5-10')")
    parser.add_argument("--skip-ocr", action="store_true",
                        help="Solo procesar páginas digitales (más rápido, omite páginas escaneadas)")

    args = parser.parse_args()

    upload_manual(args.pdf, args.name, args.pages, args.skip_ocr)


if __name__ == "__main__":
    main()

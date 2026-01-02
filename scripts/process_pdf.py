import os
import sys
import json
import base64
import argparse
import re
from pathlib import Path
from dotenv import load_dotenv
import anthropic
import fitz  # pymupdf

# Cargar variables de entorno
env_path = Path(__file__).parent.parent / ".env"
load_dotenv(env_path)

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")

# Umbral para detección de PDF digital (caracteres mínimos por página)
MIN_TEXT_CHARS = 100


def detect_pdf_type(pdf_path: str) -> dict:
    """
    Detecta si el PDF es digital, escaneado o híbrido.

    Criterio:
    - Digital: Página con texto suficiente Y SIN imágenes/ilustraciones
    - OCR: Página con imágenes O sin texto suficiente
    """
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
            # Página 100% texto digital - extracción rápida
            digital_pages.append(page_num)
        else:
            # Página con imágenes O sin texto - necesita OCR
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
        "pages_with_images": pages_with_images,
        "confidence": max(digital_ratio, 1 - digital_ratio)
    }


def detect_section_from_text(text: str) -> str | None:
    """
    Detecta el nombre de sección basándose en patrones comunes.
    """
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
    """
    Extrae texto directamente de una página digital usando PyMuPDF.
    """
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

    # Renderizar a mayor resolución para mejor OCR
    mat = fitz.Matrix(2.0, 2.0)
    pix = page.get_pixmap(matrix=mat)

    img_bytes = pix.tobytes("png")
    doc.close()

    return img_bytes


def extract_text_with_claude(image_bytes: bytes, page_num: int) -> dict:
    """Envía la imagen a Claude para extraer texto y sección."""
    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

    image_base64 = base64.standard_b64encode(image_bytes).decode("utf-8")

    message = client.messages.create(
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

    # Limpiar respuesta si viene con markdown
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


def parse_page_range(page_range: str, total_pages: int) -> list[int]:
    """Parsea un rango de páginas como '1-5' o '3' y retorna lista de índices (0-based)."""
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


def process_pdf(pdf_path: str, output_path: str = None, page_range: str = None, mode: str = "auto") -> dict:
    """Procesa un PDF con detección inteligente de tipo."""
    pdf_path = Path(pdf_path)

    if not pdf_path.exists():
        print(f"Error: No se encontró el archivo {pdf_path}")
        sys.exit(1)

    manual_name = pdf_path.stem

    # Detectar tipo de PDF
    print(f"\n{'='*60}")
    print(f"Analizando: {manual_name}")
    pdf_info = detect_pdf_type(str(pdf_path))
    total_pages = pdf_info["total_pages"]

    # Determinar modo de procesamiento
    if mode == "auto":
        pdf_type = pdf_info["type"]
    elif mode == "digital":
        pdf_type = "digital"
        pdf_info["digital_pages"] = list(range(total_pages))
        pdf_info["ocr_pages"] = []
    elif mode == "ocr":
        pdf_type = "scanned"
        pdf_info["digital_pages"] = []
        pdf_info["ocr_pages"] = list(range(total_pages))
    else:
        pdf_type = pdf_info["type"]

    digital_pages_set = set(pdf_info["digital_pages"])
    num_with_images = pdf_info.get("pages_with_images", 0)

    print(f"Tipo detectado: {pdf_type.upper()}")
    print(f"  - Páginas solo texto (extracción rápida): {len(pdf_info['digital_pages'])}")
    print(f"  - Páginas con imágenes/OCR: {len(pdf_info['ocr_pages'])} ({num_with_images} con ilustraciones)")
    print(f"{'='*60}")

    # Verificar API key solo si hay páginas que necesitan OCR
    if pdf_info["ocr_pages"] and not ANTHROPIC_API_KEY:
        print("Error: ANTHROPIC_API_KEY debe estar configurado en .env para procesar páginas escaneadas")
        sys.exit(1)

    pages_to_process = parse_page_range(page_range, total_pages)
    num_pages_to_process = len(pages_to_process)

    if page_range:
        print(f"Páginas a procesar: {page_range} ({num_pages_to_process} páginas)\n")
    else:
        print(f"Total de páginas: {total_pages}\n")

    result = {
        "manual_name": manual_name,
        "source_file": str(pdf_path),
        "total_pages": total_pages,
        "pages_processed": num_pages_to_process,
        "pdf_type": pdf_type,
        "pages": []
    }

    for i, page_num in enumerate(pages_to_process):
        is_digital = page_num in digital_pages_set
        method = "digital" if is_digital else "OCR"
        print(f"[{i + 1}/{num_pages_to_process}] Página {page_num + 1} ({method})...", end=" ", flush=True)

        try:
            if is_digital:
                # Extracción directa (rápida)
                extracted = extract_text_direct(str(pdf_path), page_num)
            else:
                # OCR con Claude Vision (lento)
                image_bytes = extract_page_as_image(str(pdf_path), page_num)
                extracted = extract_text_with_claude(image_bytes, page_num)

            page_data = {
                "page_number": page_num + 1,
                "content": extracted.get("content", ""),
                "section": extracted.get("section"),
                "extraction_method": method
            }

            result["pages"].append(page_data)
            print("OK")

        except Exception as e:
            print(f"ERROR: {e}")
            result["pages"].append({
                "page_number": page_num + 1,
                "content": "",
                "section": None,
                "error": str(e)
            })

    # Guardar resultado
    if output_path is None:
        output_path = pdf_path.parent / f"{manual_name}.json"

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    print(f"\n{'='*60}")
    print(f"Completado. Resultado guardado en: {output_path}")
    print(f"{'='*60}\n")

    return result


def main():
    parser = argparse.ArgumentParser(
        description="Procesa un PDF con detección inteligente de tipo (digital/escaneado)"
    )
    parser.add_argument("pdf", help="Ruta al archivo PDF")
    parser.add_argument("-o", "--output", help="Ruta del archivo JSON de salida")
    parser.add_argument(
        "-p", "--pages",
        help="Rango de páginas a procesar (ej: '1-5', '1,3,5', '1-3,7-10')"
    )
    parser.add_argument(
        "-m", "--mode",
        choices=["auto", "digital", "ocr"],
        default="auto",
        help="Modo de extracción: auto (detectar), digital (solo PyMuPDF), ocr (solo Claude Vision)"
    )

    args = parser.parse_args()

    process_pdf(args.pdf, args.output, args.pages, args.mode)


if __name__ == "__main__":
    main()

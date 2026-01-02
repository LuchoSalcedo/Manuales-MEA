"""
Script para generar chunks y embeddings a partir del JSON procesado por process_pdf.py
y guardarlos en Supabase.

Uso:
    python generate_embeddings.py path/to/manual.json --manual-id UUID
    python generate_embeddings.py path/to/manual.json --create-manual
"""

import os
import sys
import json
import argparse
import uuid
from pathlib import Path
from dotenv import load_dotenv
import tiktoken
from openai import OpenAI
from supabase import create_client

# Cargar variables de entorno
env_path = Path(__file__).parent.parent / ".env"
load_dotenv(env_path)

# Configuración
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

# Parámetros de chunking
CHUNK_SIZE = 800  # tokens
CHUNK_OVERLAP = 100  # tokens
EMBEDDING_MODEL = "text-embedding-ada-002"


def validate_env():
    """Valida que las variables de entorno estén configuradas."""
    missing = []
    if not SUPABASE_URL:
        missing.append("SUPABASE_URL")
    if not SUPABASE_SERVICE_KEY:
        missing.append("SUPABASE_SERVICE_KEY")
    if not OPENAI_API_KEY:
        missing.append("OPENAI_API_KEY")

    if missing:
        print(f"Error: Variables de entorno faltantes: {', '.join(missing)}")
        print("Configura estas variables en el archivo .env")
        sys.exit(1)


def count_tokens(text: str) -> int:
    """Cuenta los tokens de un texto usando tiktoken."""
    encoding = tiktoken.encoding_for_model("gpt-3.5-turbo")
    return len(encoding.encode(text))


def split_text_into_chunks(text: str, page_number: int, section: str) -> list[dict]:
    """
    Divide el texto en chunks de tamaño apropiado.
    Mantiene metadata de página y sección.
    """
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

        # Obtener el texto del chunk
        chunk_tokens = tokens[start:end]
        chunk_text = encoding.decode(chunk_tokens)

        chunks.append({
            "content": chunk_text,
            "page_number": page_number,
            "section": section
        })

        # Avanzar con overlap
        start = end - CHUNK_OVERLAP

        # Evitar chunks muy pequeños al final
        if len(tokens) - start < CHUNK_OVERLAP:
            break

    return chunks


def process_pages_into_chunks(pages: list[dict]) -> list[dict]:
    """Procesa todas las páginas y genera chunks."""
    all_chunks = []

    for page in pages:
        page_number = page.get("page_number")
        content = page.get("content", "").strip()
        section = page.get("section")

        if not content:
            continue

        page_chunks = split_text_into_chunks(content, page_number, section)
        all_chunks.extend(page_chunks)

    return all_chunks


def generate_embeddings(chunks: list[dict], openai_client: OpenAI) -> list[dict]:
    """Genera embeddings para cada chunk usando OpenAI."""
    print(f"\nGenerando embeddings para {len(chunks)} chunks...")

    # Procesar en batches de 100 (límite de OpenAI)
    batch_size = 100

    for i in range(0, len(chunks), batch_size):
        batch = chunks[i:i + batch_size]
        texts = [chunk["content"] for chunk in batch]

        print(f"  Procesando batch {i // batch_size + 1}/{(len(chunks) - 1) // batch_size + 1}...", end=" ", flush=True)

        response = openai_client.embeddings.create(
            model=EMBEDDING_MODEL,
            input=texts
        )

        for j, embedding_data in enumerate(response.data):
            chunks[i + j]["embedding"] = embedding_data.embedding

        print("OK")

    return chunks


def create_manual_record(supabase, manual_name: str, source_file: str, total_pages: int) -> str:
    """Crea un registro de manual en Supabase y retorna su ID."""
    manual_id = str(uuid.uuid4())

    response = supabase.table("manuals").insert({
        "id": manual_id,
        "name": manual_name,
        "description": f"Manual importado desde {source_file}",
        "total_pages": total_pages,
        "processed": False
    }).execute()

    if response.data:
        print(f"Manual creado con ID: {manual_id}")
        return manual_id
    else:
        print(f"Error al crear manual: {response}")
        sys.exit(1)


def save_chunks_to_supabase(supabase, chunks: list[dict], manual_id: str):
    """Guarda los chunks con embeddings en Supabase."""
    print(f"\nGuardando {len(chunks)} chunks en Supabase...")

    # Insertar en batches de 50
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

        print(f"  Guardando batch {i // batch_size + 1}/{(len(chunks) - 1) // batch_size + 1}...", end=" ", flush=True)

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
    print(f"Manual {manual_id} marcado como procesado.")


def main():
    parser = argparse.ArgumentParser(
        description="Genera embeddings y guarda chunks en Supabase"
    )
    parser.add_argument("json_file", help="Ruta al archivo JSON generado por process_pdf.py")
    parser.add_argument("--manual-id", help="UUID del manual existente en Supabase")
    parser.add_argument("--create-manual", action="store_true",
                        help="Crear nuevo registro de manual en Supabase")
    parser.add_argument("--dry-run", action="store_true",
                        help="Solo mostrar estadísticas sin guardar")

    args = parser.parse_args()

    # Validar entorno
    validate_env()

    # Cargar JSON
    json_path = Path(args.json_file)
    if not json_path.exists():
        print(f"Error: No se encontró el archivo {json_path}")
        sys.exit(1)

    with open(json_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    manual_name = data.get("manual_name", json_path.stem)
    source_file = data.get("source_file", str(json_path))
    total_pages = data.get("total_pages", 0)
    pages = data.get("pages", [])

    print(f"\n{'='*60}")
    print(f"Manual: {manual_name}")
    print(f"Páginas en JSON: {len(pages)}")
    print(f"{'='*60}")

    # Generar chunks
    print("\nGenerando chunks...")
    chunks = process_pages_into_chunks(pages)

    # Estadísticas
    total_tokens = sum(count_tokens(c["content"]) for c in chunks)
    print(f"  Chunks generados: {len(chunks)}")
    print(f"  Tokens totales: {total_tokens:,}")
    print(f"  Promedio tokens/chunk: {total_tokens // len(chunks) if chunks else 0}")

    if args.dry_run:
        print("\n[DRY RUN] No se guardaron datos.")
        print("\nEjemplo de chunks:")
        for i, chunk in enumerate(chunks[:3]):
            print(f"\n--- Chunk {i+1} (página {chunk['page_number']}) ---")
            print(chunk["content"][:200] + "...")
        return

    # Validar manual_id
    manual_id = args.manual_id

    # Conectar a servicios
    supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    openai_client = OpenAI(api_key=OPENAI_API_KEY)

    # Crear manual si se solicita
    if args.create_manual:
        manual_id = create_manual_record(supabase, manual_name, source_file, total_pages)
    elif not manual_id:
        print("\nError: Debes especificar --manual-id o --create-manual")
        sys.exit(1)

    # Generar embeddings
    chunks = generate_embeddings(chunks, openai_client)

    # Guardar en Supabase
    saved = save_chunks_to_supabase(supabase, chunks, manual_id)

    # Marcar como procesado
    mark_manual_as_processed(supabase, manual_id)

    print(f"\n{'='*60}")
    print(f"Completado!")
    print(f"  Chunks guardados: {saved}")
    print(f"  Manual ID: {manual_id}")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    main()

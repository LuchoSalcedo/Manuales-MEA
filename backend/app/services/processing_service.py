"""Servicio para procesar PDFs automáticamente."""

import os
import json
import uuid
import base64
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import threading

import fitz  # pymupdf
import anthropic
import tiktoken
from openai import OpenAI

from app.config import get_settings
from app.services.supabase_client import get_supabase_client

settings = get_settings()

# Estado de procesamiento en memoria (compatibilidad)
processing_status = {}
processing_lock = threading.Lock()

# Sistema de señales para pause/cancel
job_signals = {}  # {job_id: "pause" | "cancel" | None}
signal_lock = threading.Lock()


def set_job_signal(job_id: str, signal: str | None):
    """Establece una señal para un job (pause/cancel/None)."""
    with signal_lock:
        job_signals[job_id] = signal


def get_job_signal(job_id: str) -> str | None:
    """Obtiene la señal actual de un job."""
    with signal_lock:
        return job_signals.get(job_id)


def clear_job_signal(job_id: str):
    """Limpia la señal de un job."""
    with signal_lock:
        job_signals.pop(job_id, None)


# ==================== Funciones de BD para Jobs ====================

def create_job_in_db(job_id: str, pdf_path: str, manual_name: str) -> None:
    """Crea un registro de job en la base de datos."""
    supabase = get_supabase_client()
    supabase.table("processing_jobs").insert({
        "id": job_id,
        "pdf_path": pdf_path,
        "manual_name": manual_name,
        "status": "queued",
        "message": "En cola..."
    }).execute()


def update_job_in_db(job_id: str, **kwargs) -> None:
    """Actualiza un job en la base de datos."""
    supabase = get_supabase_client()
    supabase.table("processing_jobs").update(kwargs).eq("id", job_id).execute()


def get_job_from_db(job_id: str) -> dict | None:
    """Obtiene un job de la base de datos."""
    supabase = get_supabase_client()
    response = supabase.table("processing_jobs").select("*").eq("id", job_id).execute()
    return response.data[0] if response.data else None


def save_job_progress(job_id: str, processed_pages: list, current_page: int, status: str = "paused") -> None:
    """Guarda el progreso de un job para poder reanudarlo."""
    supabase = get_supabase_client()
    update_data = {
        "processed_pages": processed_pages,
        "current_page": current_page,
        "status": status,
    }
    if status == "paused":
        update_data["paused_at"] = "now()"

    supabase.table("processing_jobs").update(update_data).eq("id", job_id).execute()


def cleanup_cancelled_job(job_id: str, manual_id: str | None) -> None:
    """Limpia datos parciales de un job cancelado."""
    supabase = get_supabase_client()

    # Eliminar chunks parciales si hay manual_id
    if manual_id:
        supabase.table("chunks").delete().eq("manual_id", manual_id).execute()
        # Marcar manual como no procesado o eliminarlo
        supabase.table("manuals").delete().eq("id", manual_id).execute()

    # Actualizar estado del job
    supabase.table("processing_jobs").update({
        "status": "cancelled",
        "message": "Procesamiento cancelado por el usuario"
    }).eq("id", job_id).execute()


CHUNK_SIZE = 800
CHUNK_OVERLAP = 100
EMBEDDING_MODEL = "text-embedding-ada-002"

# Umbral para detección de PDF digital
MIN_TEXT_CHARS = 100  # Mínimo de caracteres para considerar una página como digital


def detect_pdf_type(pdf_path: str) -> dict:
    """
    Detecta si el PDF es digital (texto extraíble), escaneado (imágenes) o híbrido.

    Criterio:
    - Digital: Página con texto suficiente Y SIN imágenes/ilustraciones
    - OCR: Página con imágenes O sin texto suficiente

    Returns:
        {
            "type": "digital" | "scanned" | "hybrid",
            "digital_pages": list[int],  # índices de páginas solo texto (0-based)
            "ocr_pages": list[int],       # índices de páginas que necesitan OCR (0-based)
            "total_pages": int,
            "pages_with_images": int,
            "confidence": float
        }
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

    # Determinar tipo
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
    Detecta el nombre de sección de una página basándose en patrones comunes.
    Busca headers en mayúsculas, títulos de capítulos, etc.
    """
    import re

    lines = text.strip().split('\n')
    if not lines:
        return None

    # Patrones comunes de secciones en manuales técnicos
    section_patterns = [
        r'^(CHAPTER|SECTION|PART)\s+\d+[\s:\-]+(.+)$',  # CHAPTER 1: Title
        r'^(CAPÍTULO|SECCIÓN|PARTE)\s+\d+[\s:\-]+(.+)$',  # Español
        r'^(\d+\.?\s+)?([A-Z][A-Z\s]+)$',  # Títulos en mayúsculas
        r'^(TABLE OF CONTENTS|INDEX|INTRODUCTION|APPENDIX)',  # Secciones comunes
        r'^(ÍNDICE|INTRODUCCIÓN|APÉNDICE)',  # Secciones en español
    ]

    # Buscar en las primeras líneas
    for line in lines[:10]:
        line = line.strip()
        if not line:
            continue

        # Verificar si la línea está en mayúsculas y tiene longitud razonable
        if line.isupper() and 5 <= len(line) <= 100:
            return line

        # Buscar patrones específicos
        for pattern in section_patterns:
            match = re.match(pattern, line, re.IGNORECASE)
            if match:
                return line

    return None


def extract_text_direct(pdf_path: str, page_num: int) -> dict:
    """
    Extrae texto directamente de una página digital usando PyMuPDF.
    No usa OCR, solo extrae texto incrustado en el PDF.

    Returns:
        {"content": str, "section": str | None}
    """
    doc = fitz.open(pdf_path)
    page = doc[page_num]

    # Extraer texto
    text = page.get_text()

    # Detectar sección
    section = detect_section_from_text(text)

    doc.close()

    return {
        "content": text.strip(),
        "section": section
    }


def get_processing_status(job_id: str) -> dict:
    """Obtiene el estado de un trabajo de procesamiento."""
    with processing_lock:
        return processing_status.get(job_id, {"status": "not_found"})


def update_status(job_id: str, status: str, progress: int = 0, total: int = 0, message: str = "", manual_id: str = None):
    """Actualiza el estado de procesamiento."""
    with processing_lock:
        processing_status[job_id] = {
            "status": status,
            "progress": progress,
            "total": total,
            "message": message,
            "manual_id": manual_id,
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
    """Divide el texto en chunks."""
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


def process_pdf_background(job_id: str, pdf_path: str, manual_name: str, resume_from: int = 0, resume_data: dict = None):
    """Procesa un PDF en background con detección inteligente de tipo y soporte pause/resume."""
    manual_id = None

    try:
        openai_client = OpenAI(api_key=settings.openai_api_key)
        supabase = get_supabase_client()

        # Si es resume, cargar datos previos
        if resume_data:
            pdf_info = {
                "type": resume_data.get("pdf_type"),
                "digital_pages": resume_data.get("digital_pages", []),
                "ocr_pages": resume_data.get("ocr_pages", []),
                "total_pages": resume_data.get("total_pages", 0),
                "pages_with_images": resume_data.get("pages_with_images", 0)
            }
            total_pages = pdf_info["total_pages"]
            pdf_type = pdf_info["type"]
            manual_id = resume_data.get("manual_id")
            all_pages = resume_data.get("processed_pages", [])
        else:
            # Fase 0: Detectar tipo de PDF
            update_status(job_id, "detecting", 0, 0, "Analizando tipo de PDF...")
            pdf_info = detect_pdf_type(pdf_path)
            total_pages = pdf_info["total_pages"]
            pdf_type = pdf_info["type"]
            all_pages = []

            # Guardar info de detección en BD
            update_job_in_db(job_id,
                pdf_type=pdf_type,
                digital_pages=pdf_info["digital_pages"],
                ocr_pages=pdf_info["ocr_pages"],
                total_pages=total_pages,
                pages_with_images=pdf_info.get("pages_with_images", 0)
            )

        digital_pages_set = set(pdf_info["digital_pages"])

        # Solo inicializar cliente Anthropic si hay páginas que necesitan OCR
        anthropic_client = None
        if pdf_info["ocr_pages"]:
            anthropic_client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

        # Mensaje según tipo detectado
        num_digital = len(pdf_info['digital_pages'])
        num_ocr = len(pdf_info['ocr_pages'])
        num_with_images = pdf_info.get('pages_with_images', 0)

        type_messages = {
            "digital": f"PDF digital - Extracción rápida ({total_pages} páginas)",
            "scanned": f"PDF escaneado - OCR completo ({total_pages} páginas)",
            "hybrid": f"PDF híbrido - {num_digital} texto, {num_ocr} OCR ({num_with_images} con ilustraciones)"
        }
        update_status(job_id, "detecting", 0, total_pages, type_messages[pdf_type])

        # Crear registro del manual (solo si no es resume)
        if not resume_data:
            manual_id = str(uuid.uuid4())
            supabase.table("manuals").insert({
                "id": manual_id,
                "name": manual_name,
                "description": f"Procesado automáticamente ({pdf_type})",
                "total_pages": total_pages,
                "processed": False
            }).execute()

            # Actualizar job con manual_id
            update_job_in_db(job_id, manual_id=manual_id)

        # Fase 1: Extracción de texto (adaptativa)
        for page_num in range(resume_from, total_pages):
            # === CHECKPOINT: Verificar señales de pause/cancel ===
            signal = get_job_signal(job_id)
            if signal == "pause":
                # Guardar progreso y pausar
                save_job_progress(job_id, all_pages, page_num, "paused")
                update_status(job_id, "paused", page_num, total_pages,
                             f"Pausado en página {page_num}/{total_pages}", manual_id)
                clear_job_signal(job_id)
                return

            if signal == "cancel":
                # Limpiar datos parciales y cancelar
                cleanup_cancelled_job(job_id, manual_id)
                update_status(job_id, "cancelled", page_num, total_pages,
                             "Procesamiento cancelado", manual_id)
                clear_job_signal(job_id)
                return

            is_digital = page_num in digital_pages_set

            if is_digital:
                status_type = "extracting"
                status_msg = f"Extrayendo página {page_num + 1}/{total_pages} (digital)"
            else:
                status_type = "ocr"
                status_msg = f"OCR página {page_num + 1}/{total_pages} (escaneada)"

            update_status(job_id, status_type, page_num + 1, total_pages, status_msg, manual_id)
            update_job_in_db(job_id, status=status_type, current_page=page_num + 1, message=status_msg)

            try:
                if is_digital:
                    extracted = extract_text_direct(pdf_path, page_num)
                else:
                    image_bytes = extract_page_as_image(pdf_path, page_num)
                    extracted = extract_text_with_claude(image_bytes, anthropic_client)

                all_pages.append({
                    "page_number": page_num + 1,
                    "content": extracted.get("content", ""),
                    "section": extracted.get("section")
                })
            except Exception as e:
                all_pages.append({
                    "page_number": page_num + 1,
                    "content": "",
                    "section": None,
                    "error": str(e)
                })

            # Guardar progreso cada 10 páginas (para recuperación)
            if (page_num + 1) % 10 == 0:
                update_job_in_db(job_id, processed_pages=all_pages, current_page=page_num + 1)

        # === CHECKPOINT antes de chunking ===
        signal = get_job_signal(job_id)
        if signal == "pause":
            save_job_progress(job_id, all_pages, total_pages, "paused")
            update_status(job_id, "paused", total_pages, total_pages,
                         "Pausado antes de chunking", manual_id)
            clear_job_signal(job_id)
            return
        if signal == "cancel":
            cleanup_cancelled_job(job_id, manual_id)
            update_status(job_id, "cancelled", 0, 0, "Procesamiento cancelado", manual_id)
            clear_job_signal(job_id)
            return

        # Fase 2: Chunking
        update_status(job_id, "chunking", 0, 0, "Generando chunks...", manual_id)
        update_job_in_db(job_id, status="chunking", message="Generando chunks...")

        all_chunks = []
        for page in all_pages:
            if page.get("content"):
                page_chunks = split_text_into_chunks(
                    page["content"],
                    page["page_number"],
                    page.get("section")
                )
                all_chunks.extend(page_chunks)

        # Fase 3: Embeddings
        total_chunks = len(all_chunks)
        update_status(job_id, "embeddings", 0, total_chunks, "Generando embeddings...", manual_id)
        update_job_in_db(job_id, status="embeddings", message="Generando embeddings...")

        batch_size = 100
        for i in range(0, total_chunks, batch_size):
            # === CHECKPOINT en embeddings ===
            signal = get_job_signal(job_id)
            if signal == "cancel":
                cleanup_cancelled_job(job_id, manual_id)
                update_status(job_id, "cancelled", 0, 0, "Procesamiento cancelado", manual_id)
                clear_job_signal(job_id)
                return

            batch = all_chunks[i:i + batch_size]
            texts = [chunk["content"] for chunk in batch]

            response = openai_client.embeddings.create(
                model=EMBEDDING_MODEL,
                input=texts
            )

            for j, embedding_data in enumerate(response.data):
                all_chunks[i + j]["embedding"] = embedding_data.embedding

            update_status(job_id, "embeddings", min(i + batch_size, total_chunks), total_chunks,
                         f"Embeddings {min(i + batch_size, total_chunks)}/{total_chunks}", manual_id)

        # Fase 4: Guardar en Supabase
        update_status(job_id, "saving", 0, total_chunks, "Guardando en base de datos...", manual_id)
        update_job_in_db(job_id, status="saving", message="Guardando en base de datos...")

        save_batch_size = 50
        for i in range(0, total_chunks, save_batch_size):
            batch = all_chunks[i:i + save_batch_size]

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

            supabase.table("chunks").insert(records).execute()

        # Marcar como procesado
        supabase.table("manuals").update({
            "processed": True
        }).eq("id", manual_id).execute()

        # Actualizar job como completado
        update_job_in_db(job_id,
            status="completed",
            message=f"Completado: {total_chunks} chunks procesados",
            completed_at="now()"
        )

        update_status(job_id, "completed", total_chunks, total_chunks,
                     f"Completado: {total_chunks} chunks procesados", manual_id)

        # Limpiar señal si existe
        clear_job_signal(job_id)

    except Exception as e:
        error_msg = f"Error: {str(e)}"
        update_status(job_id, "error", 0, 0, error_msg)
        update_job_in_db(job_id, status="error", error_message=str(e), message=error_msg)


# Thread pool para procesamiento en background
executor = ThreadPoolExecutor(max_workers=2)


def start_processing(pdf_path: str, manual_name: str) -> str:
    """Inicia el procesamiento de un PDF en background."""
    job_id = str(uuid.uuid4())

    # Crear job en memoria (compatibilidad)
    update_status(job_id, "queued", 0, 0, "En cola...")

    # Crear job en BD (persistencia)
    try:
        create_job_in_db(job_id, pdf_path, manual_name)
    except Exception as e:
        print(f"Warning: Could not create job in DB: {e}")

    executor.submit(process_pdf_background, job_id, pdf_path, manual_name)

    return job_id


def resume_job_processing(job_id: str) -> bool:
    """
    Reanuda un job pausado.
    Retorna True si se pudo reanudar, False si no.
    """
    job = get_job_from_db(job_id)

    if not job:
        return False

    if job["status"] != "paused":
        return False

    # Preparar datos para resume
    resume_data = {
        "pdf_type": job["pdf_type"],
        "digital_pages": job.get("digital_pages", []),
        "ocr_pages": job.get("ocr_pages", []),
        "total_pages": job["total_pages"],
        "pages_with_images": job.get("pages_with_images", 0),
        "manual_id": job.get("manual_id"),
        "processed_pages": job.get("processed_pages", [])
    }

    resume_from = len(resume_data["processed_pages"])

    # Actualizar estado
    update_status(job_id, "queued", resume_from, job["total_pages"],
                 f"Reanudando desde página {resume_from}...")
    update_job_in_db(job_id, status="queued", message=f"Reanudando desde página {resume_from}...")

    # Iniciar procesamiento
    executor.submit(
        process_pdf_background,
        job_id,
        job["pdf_path"],
        job["manual_name"],
        resume_from=resume_from,
        resume_data=resume_data
    )

    return True


def get_active_jobs() -> list[dict]:
    """Obtiene todos los jobs activos (no completados/cancelados)."""
    supabase = get_supabase_client()
    response = supabase.table("processing_jobs") \
        .select("*") \
        .not_.in_("status", ["completed", "cancelled"]) \
        .order("created_at", desc=True) \
        .execute()
    return response.data


def get_paused_jobs() -> list[dict]:
    """Obtiene todos los jobs pausados."""
    supabase = get_supabase_client()
    response = supabase.table("processing_jobs") \
        .select("*") \
        .eq("status", "paused") \
        .order("paused_at", desc=True) \
        .execute()
    return response.data

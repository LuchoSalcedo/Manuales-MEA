"""Endpoint para servir páginas del manual como imágenes."""

import io
from uuid import UUID
from pathlib import Path
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
import fitz  # pymupdf

from app.services.supabase_client import get_supabase_client

router = APIRouter(prefix="/pages", tags=["pages"])

UPLOAD_DIR = Path(__file__).parent.parent.parent.parent / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)


def get_pdf_from_storage(supabase, filename: str) -> bytes | None:
    """Descarga un PDF de Supabase Storage."""
    try:
        storage_path = f"pdfs/{filename}"
        response = supabase.storage.from_("manuals").download(storage_path)
        return response
    except Exception as e:
        print(f"Error descargando de Storage: {e}")
        return None


@router.get("/{manual_id}/{page_number}")
async def get_page_image(manual_id: UUID, page_number: int):
    """
    Retorna una página del manual como imagen PNG.
    """
    try:
        # Obtener información del manual
        supabase = get_supabase_client()
        response = supabase.table("manuals").select("*").eq("id", str(manual_id)).single().execute()

        if not response.data:
            raise HTTPException(status_code=404, detail="Manual no encontrado")

        manual = response.data
        manual_name = manual.get("name", "")
        original_filename = manual.get("original_filename", "")

        # Variable para almacenar el contenido del PDF
        pdf_content = None
        pdf_path = None

        # 1. Primero intentar con archivo local (original_filename)
        if original_filename:
            candidate = UPLOAD_DIR / original_filename
            if candidate.exists():
                pdf_path = candidate

        # 2. Si no está local, buscar por coincidencia de nombre
        if not pdf_path:
            for pdf_file in UPLOAD_DIR.glob("*.pdf"):
                if manual_name in pdf_file.stem or pdf_file.stem in manual_name:
                    pdf_path = pdf_file
                    break

        # 3. Si no está local, descargar de Supabase Storage
        if not pdf_path or not pdf_path.exists():
            if original_filename:
                pdf_content = get_pdf_from_storage(supabase, original_filename)

            # Intentar con nombre del manual si no funcionó
            if not pdf_content:
                pdf_content = get_pdf_from_storage(supabase, f"{manual_name}.pdf")

        if not pdf_path and not pdf_content:
            raise HTTPException(status_code=404, detail="PDF no encontrado")

        # Abrir PDF (desde archivo local o desde bytes descargados)
        if pdf_path and pdf_path.exists():
            doc = fitz.open(str(pdf_path))
        else:
            doc = fitz.open(stream=pdf_content, filetype="pdf")

        if page_number < 1 or page_number > len(doc):
            doc.close()
            raise HTTPException(status_code=400, detail=f"Página inválida. El manual tiene {len(doc)} páginas.")

        # Obtener página (0-indexed)
        page = doc[page_number - 1]

        # Renderizar a imagen con buena resolución
        mat = fitz.Matrix(2.0, 2.0)  # 2x zoom para mejor calidad
        pix = page.get_pixmap(matrix=mat)

        # Convertir a PNG
        img_bytes = pix.tobytes("png")

        doc.close()

        return Response(
            content=img_bytes,
            media_type="image/png",
            headers={
                "Cache-Control": "public, max-age=3600",
                "Content-Disposition": f"inline; filename=page_{page_number}.png"
            }
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error obteniendo página: {str(e)}")


@router.get("/{manual_id}/info")
async def get_manual_pages_info(manual_id: UUID):
    """Retorna información sobre las páginas del manual."""
    try:
        supabase = get_supabase_client()
        response = supabase.table("manuals").select("*").eq("id", str(manual_id)).single().execute()

        if not response.data:
            raise HTTPException(status_code=404, detail="Manual no encontrado")

        manual = response.data

        return {
            "manual_id": str(manual_id),
            "name": manual.get("name"),
            "total_pages": manual.get("total_pages", 0)
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")

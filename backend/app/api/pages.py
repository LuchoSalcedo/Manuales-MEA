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

        # Buscar el PDF correspondiente
        pdf_path = None
        for pdf_file in UPLOAD_DIR.glob("*.pdf"):
            if manual_name in pdf_file.stem or pdf_file.stem in manual_name:
                pdf_path = pdf_file
                break

        # Si no se encuentra por nombre, intentar buscar por descripción
        if not pdf_path:
            description = manual.get("description", "")
            for pdf_file in UPLOAD_DIR.glob("*.pdf"):
                if pdf_file.stem in description:
                    pdf_path = pdf_file
                    break

        if not pdf_path or not pdf_path.exists():
            raise HTTPException(status_code=404, detail="PDF no encontrado")

        # Abrir PDF y extraer página
        doc = fitz.open(str(pdf_path))

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

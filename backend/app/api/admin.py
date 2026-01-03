"""Endpoints de administración."""

import os
from uuid import UUID
from pathlib import Path
from fastapi import APIRouter, HTTPException, UploadFile, File, Depends
from pydantic import BaseModel

from app.services.supabase_client import get_supabase_client
from app.services.processing_service import (
    start_processing, get_processing_status,
    set_job_signal, resume_job_processing,
    get_active_jobs, get_paused_jobs
)
from app.middleware.auth import require_admin, get_current_user
from app.models.schemas import CurrentUser
from app.api.settings import get_setting_value

router = APIRouter(prefix="/admin", tags=["admin"])

UPLOAD_DIR = Path(__file__).parent.parent.parent.parent / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

DEFAULT_MAX_FILE_SIZE_MB = 50  # Default 50MB


class UpdateManualRequest(BaseModel):
    name: str


@router.post("/upload")
async def upload_and_process_manual(
    file: UploadFile = File(...),
    current_user: CurrentUser = Depends(require_admin)
):
    """
    Sube un archivo PDF y lo procesa automáticamente.
    Retorna un job_id para monitorear el progreso.
    Solo accesible para administradores.
    """
    if not file.filename or not file.filename.endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Solo se permiten archivos PDF")

    content = await file.read()

    # Get dynamic max file size from settings
    max_size_mb = get_setting_value("max_upload_size_mb", DEFAULT_MAX_FILE_SIZE_MB)
    max_file_size = max_size_mb * 1024 * 1024

    if len(content) > max_file_size:
        raise HTTPException(status_code=400, detail=f"El archivo excede {max_size_mb}MB")

    # Guardar archivo
    file_path = UPLOAD_DIR / file.filename
    with open(file_path, "wb") as f:
        f.write(content)

    # Nombre del manual (sin extensión)
    manual_name = Path(file.filename).stem

    # Iniciar procesamiento en background
    job_id = start_processing(str(file_path), manual_name)

    return {
        "job_id": job_id,
        "filename": file.filename,
        "message": "Procesamiento iniciado"
    }


@router.get("/processing/{job_id}")
async def get_job_status(
    job_id: str,
    current_user: CurrentUser = Depends(require_admin)
):
    """Obtiene el estado de un trabajo de procesamiento. Solo admins."""
    status = get_processing_status(job_id)

    if status["status"] == "not_found":
        raise HTTPException(status_code=404, detail="Trabajo no encontrado")

    return status


@router.put("/manuals/{manual_id}")
async def update_manual(
    manual_id: UUID,
    request: UpdateManualRequest,
    current_user: CurrentUser = Depends(require_admin)
):
    """Actualiza el nombre de un manual. Solo admins."""
    try:
        supabase = get_supabase_client()

        response = supabase.table("manuals").update({
            "name": request.name
        }).eq("id", str(manual_id)).execute()

        if not response.data:
            raise HTTPException(status_code=404, detail="Manual no encontrado")

        return {"message": "Manual actualizado", "name": request.name}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error actualizando manual: {str(e)}")


@router.delete("/manuals/{manual_id}")
async def delete_manual(
    manual_id: UUID,
    current_user: CurrentUser = Depends(require_admin)
):
    """Elimina un manual y sus chunks asociados. Solo admins."""
    try:
        supabase = get_supabase_client()

        # Primero eliminar chunks
        supabase.table("chunks").delete().eq("manual_id", str(manual_id)).execute()

        # Luego eliminar manual
        response = supabase.table("manuals").delete().eq("id", str(manual_id)).execute()

        if not response.data:
            raise HTTPException(status_code=404, detail="Manual no encontrado")

        return {"message": "Manual eliminado correctamente"}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error eliminando manual: {str(e)}")


@router.get("/stats")
async def get_stats(current_user: CurrentUser = Depends(require_admin)):
    """Obtiene estadísticas del sistema. Solo admins."""
    try:
        supabase = get_supabase_client()

        manuals_response = supabase.table("manuals").select("id", count="exact").execute()
        total_manuals = manuals_response.count or 0

        chunks_response = supabase.table("chunks").select("id", count="exact").execute()
        total_chunks = chunks_response.count or 0

        pdfs = list(UPLOAD_DIR.glob("*.pdf"))

        return {
            "total_manuals": total_manuals,
            "total_chunks": total_chunks,
            "pending_pdfs": len(pdfs),
            "upload_dir": str(UPLOAD_DIR)
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error obteniendo stats: {str(e)}")


# ==================== Endpoints de control de procesamiento ====================

@router.post("/processing/{job_id}/pause")
async def pause_job(
    job_id: str,
    current_user: CurrentUser = Depends(require_admin)
):
    """
    Pausa un procesamiento en curso.
    El progreso se guarda y puede reanudarse después.
    """
    set_job_signal(job_id, "pause")
    return {"message": "Señal de pausa enviada", "job_id": job_id}


@router.post("/processing/{job_id}/resume")
async def resume_job(
    job_id: str,
    current_user: CurrentUser = Depends(require_admin)
):
    """
    Reanuda un procesamiento pausado.
    Continúa desde la última página procesada.
    """
    success = resume_job_processing(job_id)

    if not success:
        raise HTTPException(
            status_code=400,
            detail="No se puede reanudar este job. Verifica que esté en estado 'paused'."
        )

    return {"message": "Procesamiento reanudado", "job_id": job_id}


@router.post("/processing/{job_id}/cancel")
async def cancel_job(
    job_id: str,
    current_user: CurrentUser = Depends(require_admin)
):
    """
    Cancela un procesamiento.
    Elimina datos parciales pero mantiene el archivo PDF.
    """
    set_job_signal(job_id, "cancel")
    return {"message": "Señal de cancelación enviada", "job_id": job_id}


@router.get("/processing/active")
async def list_active_jobs(
    current_user: CurrentUser = Depends(require_admin)
):
    """Lista todos los jobs activos (en proceso o pausados)."""
    try:
        jobs = get_active_jobs()
        return {"jobs": jobs, "count": len(jobs)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error obteniendo jobs: {str(e)}")


@router.get("/processing/paused")
async def list_paused_jobs(
    current_user: CurrentUser = Depends(require_admin)
):
    """Lista todos los jobs pausados que pueden reanudarse."""
    try:
        jobs = get_paused_jobs()
        return {"jobs": jobs, "count": len(jobs)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error obteniendo jobs pausados: {str(e)}")

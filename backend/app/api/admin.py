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

    # Guardar archivo localmente (temporal para procesamiento)
    file_path = UPLOAD_DIR / file.filename
    with open(file_path, "wb") as f:
        f.write(content)

    # Subir a Supabase Storage para persistencia
    try:
        supabase = get_supabase_client()
        storage_path = f"pdfs/{file.filename}"
        supabase.storage.from_("manuals").upload(
            storage_path,
            content,
            {"content-type": "application/pdf", "upsert": "true"}
        )
    except Exception as e:
        # Si falla el storage, continuar con local (para desarrollo)
        print(f"Warning: No se pudo subir a Storage: {e}")

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
    """Elimina un manual y todos sus datos asociados (cascade delete). Solo admins."""
    try:
        supabase = get_supabase_client()

        # Obtener info del manual primero
        manual_response = supabase.table("manuals").select("*").eq("id", str(manual_id)).execute()
        if not manual_response.data:
            raise HTTPException(status_code=404, detail="Manual no encontrado")

        manual = manual_response.data[0]
        original_filename = manual.get("original_filename", "")

        # 1. Eliminar chunks y sus embeddings
        supabase.table("chunks").delete().eq("manual_id", str(manual_id)).execute()

        # 2. Intentar eliminar PDF de Supabase Storage
        if original_filename:
            try:
                storage_path = f"pdfs/{original_filename}"
                supabase.storage.from_("manuals").remove([storage_path])
            except Exception as e:
                print(f"Warning: No se pudo eliminar PDF de storage: {e}")

        # 3. Intentar eliminar imágenes de páginas de Storage
        try:
            # Las imágenes están en pages/{manual_id}/
            pages_path = f"pages/{manual_id}"
            # Listar y eliminar todos los archivos en esa carpeta
            files = supabase.storage.from_("manuals").list(pages_path)
            if files:
                paths_to_delete = [f"{pages_path}/{f['name']}" for f in files]
                if paths_to_delete:
                    supabase.storage.from_("manuals").remove(paths_to_delete)
        except Exception as e:
            print(f"Warning: No se pudieron eliminar imágenes de storage: {e}")

        # 4. Eliminar archivo local si existe
        if original_filename:
            local_path = UPLOAD_DIR / original_filename
            if local_path.exists():
                local_path.unlink()

        # 5. Finalmente eliminar el registro del manual
        supabase.table("manuals").delete().eq("id", str(manual_id)).execute()

        return {"message": "Manual y todos sus datos eliminados correctamente"}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error eliminando manual: {str(e)}")


@router.get("/manuals/duplicates")
async def get_duplicate_manuals(
    current_user: CurrentUser = Depends(require_admin)
):
    """Detecta manuales duplicados (mismo nombre). Solo admins."""
    try:
        supabase = get_supabase_client()

        # Obtener todos los manuales
        response = supabase.table("manuals").select("id, name, total_pages, created_at").order("name").execute()

        # Agrupar por nombre
        from collections import defaultdict
        by_name = defaultdict(list)
        for m in response.data:
            by_name[m['name']].append(m)

        duplicates = []
        for name, entries in by_name.items():
            if len(entries) > 1:
                # Obtener chunks de cada entrada
                entries_info = []
                for e in entries:
                    chunks_resp = supabase.table("chunks").select("id", count="exact").eq("manual_id", e['id']).execute()
                    entries_info.append({
                        "id": e['id'],
                        "name": e['name'],
                        "total_pages": e['total_pages'],
                        "chunks": chunks_resp.count or 0,
                        "created_at": e['created_at']
                    })

                # Ordenar: el que tiene más chunks primero (el "bueno")
                entries_info.sort(key=lambda x: (-x['chunks'], x['created_at']))

                duplicates.append({
                    "name": name,
                    "count": len(entries_info),
                    "entries": entries_info,
                    "recommended_keep": entries_info[0]['id'] if entries_info else None
                })

        return {
            "has_duplicates": len(duplicates) > 0,
            "duplicate_groups": duplicates,
            "total_duplicate_entries": sum(d['count'] - 1 for d in duplicates)
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error detectando duplicados: {str(e)}")


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

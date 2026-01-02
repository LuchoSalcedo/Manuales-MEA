"""Endpoints de manuales."""

from uuid import UUID
from fastapi import APIRouter, HTTPException
from app.models.schemas import ManualInfo
from app.services.supabase_client import get_supabase_client

router = APIRouter(prefix="/manuals", tags=["manuals"])


@router.get("/", response_model=list[ManualInfo])
async def list_manuals() -> list[ManualInfo]:
    """Lista todos los manuales procesados."""
    try:
        supabase = get_supabase_client()
        response = supabase.table("manuals").select("*").eq("processed", True).execute()

        return [
            ManualInfo(
                id=m["id"],
                name=m["name"],
                description=m.get("description"),
                equipment_type=m.get("equipment_type"),
                total_pages=m.get("total_pages"),
                processed=m["processed"],
                created_at=m.get("created_at")
            )
            for m in response.data
        ]

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error obteniendo manuales: {str(e)}"
        )


@router.get("/{manual_id}", response_model=ManualInfo)
async def get_manual(manual_id: UUID) -> ManualInfo:
    """Obtiene información de un manual específico."""
    try:
        supabase = get_supabase_client()
        response = supabase.table("manuals").select("*").eq("id", str(manual_id)).single().execute()

        if not response.data:
            raise HTTPException(status_code=404, detail="Manual no encontrado")

        m = response.data
        return ManualInfo(
            id=m["id"],
            name=m["name"],
            description=m.get("description"),
            equipment_type=m.get("equipment_type"),
            total_pages=m.get("total_pages"),
            processed=m["processed"],
            created_at=m.get("created_at")
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error obteniendo manual: {str(e)}"
        )

"""Endpoints de configuracion global de la aplicacion."""

from typing import Dict, Any, List
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from app.models.schemas import CurrentUser
from app.middleware.auth import get_current_user, require_master_admin
from app.services.supabase_client import get_supabase_client

router = APIRouter(prefix="/settings", tags=["settings"])


class SettingUpdate(BaseModel):
    value: Any


class SettingResponse(BaseModel):
    key: str
    value: Any
    description: str | None = None


# Configuraciones validas y sus tipos
VALID_SETTINGS = {
    "anthropic_model": {
        "type": "string",
        "allowed_values": [
            "claude-3-5-haiku-20241022",
            "claude-sonnet-4-20250514",
            "claude-opus-4-20250514"
        ],
        "description": "Modelo de Anthropic para el chat RAG"
    },
    "max_upload_size_mb": {
        "type": "number",
        "min": 1,
        "max": 200,
        "description": "Tamano maximo de archivo para upload en MB"
    }
}


@router.get("/", response_model=List[SettingResponse])
async def get_all_settings(
    current_user: CurrentUser = Depends(get_current_user)
):
    """Obtiene todas las configuraciones."""
    supabase = get_supabase_client()

    response = supabase.table("app_settings").select("*").execute()

    return [
        SettingResponse(
            key=item["key"],
            value=item["value"],
            description=item.get("description")
        )
        for item in response.data
    ]


@router.get("/{key}", response_model=SettingResponse)
async def get_setting(
    key: str,
    current_user: CurrentUser = Depends(get_current_user)
):
    """Obtiene una configuracion especifica."""
    supabase = get_supabase_client()

    response = supabase.table("app_settings").select("*").eq("key", key).single().execute()

    if not response.data:
        raise HTTPException(status_code=404, detail=f"Configuracion '{key}' no encontrada")

    return SettingResponse(
        key=response.data["key"],
        value=response.data["value"],
        description=response.data.get("description")
    )


@router.put("/{key}", response_model=SettingResponse)
async def update_setting(
    key: str,
    setting: SettingUpdate,
    current_user: CurrentUser = Depends(require_master_admin)
):
    """
    Actualiza una configuracion (solo Administrador Maestro).
    """
    supabase = get_supabase_client()

    # Validar que la configuracion existe
    if key not in VALID_SETTINGS:
        raise HTTPException(
            status_code=400,
            detail=f"Configuracion '{key}' no es valida. Opciones: {list(VALID_SETTINGS.keys())}"
        )

    config = VALID_SETTINGS[key]

    # Validar tipo
    if config["type"] == "string":
        if not isinstance(setting.value, str):
            raise HTTPException(status_code=400, detail="El valor debe ser una cadena de texto")
        if "allowed_values" in config and setting.value not in config["allowed_values"]:
            raise HTTPException(
                status_code=400,
                detail=f"Valor no permitido. Opciones: {config['allowed_values']}"
            )
    elif config["type"] == "number":
        if not isinstance(setting.value, (int, float)):
            raise HTTPException(status_code=400, detail="El valor debe ser un numero")
        if "min" in config and setting.value < config["min"]:
            raise HTTPException(status_code=400, detail=f"El valor minimo es {config['min']}")
        if "max" in config and setting.value > config["max"]:
            raise HTTPException(status_code=400, detail=f"El valor maximo es {config['max']}")

    # Actualizar
    response = supabase.table("app_settings").update({
        "value": setting.value,
        "updated_by": str(current_user.id)
    }).eq("key", key).execute()

    if not response.data:
        # Si no existe, insertar
        response = supabase.table("app_settings").insert({
            "key": key,
            "value": setting.value,
            "description": config.get("description"),
            "updated_by": str(current_user.id)
        }).execute()

    return SettingResponse(
        key=response.data[0]["key"],
        value=response.data[0]["value"],
        description=response.data[0].get("description")
    )


def get_setting_value(key: str, default: Any = None) -> Any:
    """
    Funcion helper para obtener el valor de una configuracion.
    Util para usar desde otros modulos del backend.
    """
    try:
        supabase = get_supabase_client()
        response = supabase.table("app_settings").select("value").eq("key", key).single().execute()

        if response.data:
            return response.data["value"]
        return default
    except Exception:
        return default

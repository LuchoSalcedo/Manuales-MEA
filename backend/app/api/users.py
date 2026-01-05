"""Endpoints de gestión de usuarios."""

from uuid import UUID
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Depends, Query

from app.models.schemas import (
    UserCreate, UserUpdate, UserSelfUpdate, UserResponse, UserRole, CurrentUser
)
from app.middleware.auth import (
    get_current_user, require_admin, can_manage_user, can_create_role, can_change_role
)
from app.services.supabase_client import get_supabase_client
from app.config import get_settings

router = APIRouter(prefix="/users", tags=["users"])
settings = get_settings()


@router.get("/me", response_model=UserResponse)
async def get_current_user_profile(
    current_user: CurrentUser = Depends(get_current_user)
):
    """Obtiene el perfil del usuario autenticado."""
    supabase = get_supabase_client()

    profile = supabase.table("profiles").select("*").eq("id", str(current_user.id)).single().execute()

    if not profile.data:
        raise HTTPException(status_code=404, detail="Perfil no encontrado")

    return UserResponse(**profile.data)


@router.put("/me", response_model=UserResponse)
async def update_own_profile(
    user_data: UserSelfUpdate,
    current_user: CurrentUser = Depends(get_current_user)
):
    """
    Actualiza el perfil del usuario autenticado.
    Solo puede modificar: name, surname, location.
    No puede modificar: role, is_active, email.
    """
    supabase = get_supabase_client()

    # Build update data (solo campos permitidos)
    update_dict = user_data.model_dump(exclude_unset=True)

    if not update_dict:
        raise HTTPException(status_code=400, detail="No hay datos para actualizar")

    response = supabase.table("profiles").update(update_dict).eq("id", str(current_user.id)).execute()

    if not response.data:
        raise HTTPException(status_code=500, detail="Error actualizando perfil")

    return UserResponse(**response.data[0])


@router.get("/", response_model=List[UserResponse])
async def list_users(
    role: Optional[UserRole] = Query(None, description="Filtrar por rol"),
    current_user: CurrentUser = Depends(require_admin)
):
    """
    Lista todos los usuarios (solo admins).
    - Administrador: solo ve usuarios con rol 'usuario'
    - Administrador Maestro: ve todos los usuarios
    """
    supabase = get_supabase_client()

    query = supabase.table("profiles").select("*")

    # Filter by role if specified
    if role:
        query = query.eq("role", role.value)
    elif current_user.role == UserRole.ADMINISTRADOR:
        # Regular admins can see usuarios and other administradores (but not admin maestro)
        query = query.in_("role", [UserRole.USUARIO.value, UserRole.ADMINISTRADOR.value])

    response = query.order("created_at", desc=True).execute()

    return [UserResponse(**user) for user in response.data]


@router.post("/", response_model=UserResponse)
async def create_user(
    user_data: UserCreate,
    current_user: CurrentUser = Depends(require_admin)
):
    """
    Crea un nuevo usuario (solo admins).
    - Administrador: solo puede crear usuarios con rol 'usuario'
    - Administrador Maestro: puede crear cualquier rol
    """
    supabase = get_supabase_client()

    # Check role permissions
    if not can_create_role(current_user, user_data.role):
        raise HTTPException(
            status_code=403,
            detail="No tienes permiso para crear usuarios con este rol"
        )

    # Check if administrador_maestro already exists
    if user_data.role == UserRole.ADMINISTRADOR_MAESTRO:
        existing = supabase.table("profiles").select("id").eq("role", "administrador_maestro").execute()
        if existing.data:
            raise HTTPException(
                status_code=400,
                detail="Ya existe un Administrador Maestro"
            )

    try:
        # Create auth user with Supabase Admin API
        auth_response = supabase.auth.admin.create_user({
            "email": user_data.email,
            "password": user_data.password,
            "email_confirm": False,  # Require email confirmation
            "user_metadata": {
                "name": user_data.name,
                "surname": user_data.surname,
                "role": user_data.role.value
            }
        })

        if not auth_response.user:
            raise HTTPException(status_code=400, detail="Error creando usuario en auth")

        user_id = auth_response.user.id

        # Profile is auto-created by trigger, but we update it with full data
        profile_data = {
            "name": user_data.name,
            "surname": user_data.surname,
            "role": user_data.role.value,
            "location": user_data.location,
            "created_by": str(current_user.id)
        }

        # Wait a moment for trigger to create profile, then update
        profile_response = supabase.table("profiles").update(profile_data).eq("id", user_id).execute()

        if not profile_response.data:
            # If update failed (profile not created by trigger), insert it
            profile_response = supabase.table("profiles").insert({
                "id": user_id,
                "email": user_data.email,
                **profile_data
            }).execute()

        # Send invite email through Supabase
        try:
            supabase.auth.admin.invite_user_by_email(
                user_data.email,
                options={
                    "redirect_to": f"{settings.frontend_url}/auth/callback?next=/change-password"
                }
            )
        except Exception as email_error:
            print(f"Warning: Could not send invite email: {email_error}")

        return UserResponse(**profile_response.data[0])

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creando usuario: {str(e)}")


@router.get("/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: UUID,
    current_user: CurrentUser = Depends(require_admin)
):
    """Obtiene un usuario específico (solo admins)."""
    supabase = get_supabase_client()

    profile = supabase.table("profiles").select("*").eq("id", str(user_id)).single().execute()

    if not profile.data:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    target_role = UserRole(profile.data["role"])

    # Check permissions
    if not can_manage_user(current_user, target_role):
        raise HTTPException(status_code=403, detail="No tienes permiso para ver este usuario")

    return UserResponse(**profile.data)


@router.put("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: UUID,
    user_data: UserUpdate,
    current_user: CurrentUser = Depends(require_admin)
):
    """
    Actualiza un usuario (solo admins).
    - Administrador: solo puede editar usuarios con rol 'usuario'
    - Administrador Maestro: puede editar cualquier usuario
    """
    supabase = get_supabase_client()

    # Get current user data
    existing = supabase.table("profiles").select("*").eq("id", str(user_id)).single().execute()

    if not existing.data:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    target_role = UserRole(existing.data["role"])

    # Check permissions
    if not can_manage_user(current_user, target_role):
        raise HTTPException(status_code=403, detail="No tienes permiso para editar este usuario")

    # Check role change permissions
    if user_data.role is not None and user_data.role != target_role:
        if not can_change_role(current_user, target_role, user_data.role):
            raise HTTPException(status_code=403, detail="No tienes permiso para cambiar este rol")

    # Check administrador_maestro uniqueness if changing to that role
    if user_data.role == UserRole.ADMINISTRADOR_MAESTRO:
        master_exists = supabase.table("profiles").select("id").eq("role", "administrador_maestro").neq("id", str(user_id)).execute()
        if master_exists.data:
            raise HTTPException(status_code=400, detail="Ya existe un Administrador Maestro")

    # Build update data
    update_dict = user_data.model_dump(exclude_unset=True)
    if "role" in update_dict and update_dict["role"] is not None:
        update_dict["role"] = update_dict["role"].value

    if not update_dict:
        raise HTTPException(status_code=400, detail="No hay datos para actualizar")

    response = supabase.table("profiles").update(update_dict).eq("id", str(user_id)).execute()

    if not response.data:
        raise HTTPException(status_code=500, detail="Error actualizando usuario")

    return UserResponse(**response.data[0])


@router.post("/delegate-master/{user_id}")
async def delegate_master_admin(
    user_id: UUID,
    current_user: CurrentUser = Depends(require_admin)
):
    """
    Transfiere el rol de Administrador Maestro a otro usuario.
    Solo el Administrador Maestro puede ejecutar esta accion.
    El usuario destino debe ser un Administrador activo.
    """
    supabase = get_supabase_client()

    # Verify current user is master admin
    if current_user.role != UserRole.ADMINISTRADOR_MAESTRO:
        raise HTTPException(
            status_code=403,
            detail="Solo el Administrador Maestro puede delegar este rol"
        )

    # Cannot delegate to yourself
    if str(user_id) == str(current_user.id):
        raise HTTPException(
            status_code=400,
            detail="No puedes delegarte el rol a ti mismo"
        )

    # Get target user
    target = supabase.table("profiles").select("*").eq("id", str(user_id)).single().execute()

    if not target.data:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    target_role = UserRole(target.data["role"])

    # Target must be an administrator
    if target_role != UserRole.ADMINISTRADOR:
        raise HTTPException(
            status_code=400,
            detail="Solo puedes delegar el rol a un Administrador"
        )

    # Target must be active
    if not target.data.get("is_active", True):
        raise HTTPException(
            status_code=400,
            detail="El usuario debe estar activo"
        )

    try:
        # Update target to master admin
        supabase.table("profiles").update({
            "role": UserRole.ADMINISTRADOR_MAESTRO.value
        }).eq("id", str(user_id)).execute()

        # Demote current user to regular admin
        supabase.table("profiles").update({
            "role": UserRole.ADMINISTRADOR.value
        }).eq("id", str(current_user.id)).execute()

        return {
            "message": "Rol de Administrador Maestro delegado exitosamente",
            "new_master_admin_id": str(user_id)
        }

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error al delegar rol: {str(e)}"
        )


@router.delete("/{user_id}")
async def delete_user(
    user_id: UUID,
    current_user: CurrentUser = Depends(require_admin)
):
    """
    Elimina un usuario (solo admins).
    - Administrador: solo puede eliminar usuarios con rol 'usuario'
    - Administrador Maestro: puede eliminar cualquier usuario excepto sí mismo
    """
    supabase = get_supabase_client()

    # Cannot delete yourself
    if str(user_id) == str(current_user.id):
        raise HTTPException(status_code=400, detail="No puedes eliminar tu propia cuenta")

    # Get user to check role
    existing = supabase.table("profiles").select("*").eq("id", str(user_id)).single().execute()

    if not existing.data:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    target_role = UserRole(existing.data["role"])

    # Check permissions
    if not can_manage_user(current_user, target_role):
        raise HTTPException(status_code=403, detail="No tienes permiso para eliminar este usuario")

    try:
        # Delete from auth.users (will cascade to profiles via FK)
        supabase.auth.admin.delete_user(str(user_id))

        return {"message": "Usuario eliminado correctamente"}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error eliminando usuario: {str(e)}")

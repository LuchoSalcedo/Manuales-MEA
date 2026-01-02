"""Authentication middleware and dependencies."""

from typing import Optional
from uuid import UUID
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from app.services.supabase_client import get_supabase_client
from app.models.schemas import UserRole, CurrentUser

security = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)
) -> CurrentUser:
    """
    Get current authenticated user from JWT token.
    Extracts user from Supabase auth and fetches profile.
    """
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No se proporcionaron credenciales de autenticacion",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials
    supabase = get_supabase_client()

    try:
        # Verify token with Supabase
        user_response = supabase.auth.get_user(token)

        if not user_response.user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token invalido",
                headers={"WWW-Authenticate": "Bearer"},
            )

        user_id = user_response.user.id

        # Get profile from database
        profile_response = supabase.table("profiles").select("*").eq("id", user_id).single().execute()

        if not profile_response.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Perfil de usuario no encontrado"
            )

        profile = profile_response.data

        # Check if user is active
        if not profile.get("is_active", True):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Usuario desactivado"
            )

        return CurrentUser(
            id=UUID(profile["id"]),
            email=profile["email"],
            name=profile.get("name"),
            surname=profile.get("surname"),
            role=UserRole(profile["role"])
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"No se pudieron validar las credenciales: {str(e)}",
            headers={"WWW-Authenticate": "Bearer"},
        )


async def get_current_user_optional(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)
) -> Optional[CurrentUser]:
    """
    Get current user if authenticated, None otherwise.
    Useful for endpoints that work with or without auth.
    """
    if not credentials:
        return None

    try:
        return await get_current_user(credentials)
    except HTTPException:
        return None


def require_admin(current_user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    """
    Dependency that requires admin role.
    Use as: Depends(require_admin)
    """
    if current_user.role not in [UserRole.ADMINISTRADOR, UserRole.ADMINISTRADOR_MAESTRO]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Se requiere rol de Administrador"
        )
    return current_user


def require_master_admin(current_user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    """
    Dependency that requires master admin role.
    Use as: Depends(require_master_admin)
    """
    if current_user.role != UserRole.ADMINISTRADOR_MAESTRO:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Se requiere rol de Administrador Maestro"
        )
    return current_user


def can_manage_user(manager: CurrentUser, target_role: UserRole) -> bool:
    """
    Check if manager can edit/delete user with target role.

    Rules:
    - Master Admin can manage anyone
    - Admin can only manage Usuario
    - Usuario cannot manage anyone
    """
    if manager.role == UserRole.ADMINISTRADOR_MAESTRO:
        return True
    if manager.role == UserRole.ADMINISTRADOR:
        return target_role == UserRole.USUARIO
    return False


def can_create_role(manager: CurrentUser, target_role: UserRole) -> bool:
    """
    Check if manager can create user with target role.

    Rules:
    - Master Admin can create any role
    - Admin can only create Usuario
    """
    if manager.role == UserRole.ADMINISTRADOR_MAESTRO:
        return True
    if manager.role == UserRole.ADMINISTRADOR:
        return target_role == UserRole.USUARIO
    return False

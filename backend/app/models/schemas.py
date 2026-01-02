"""Schemas Pydantic para la API."""

from enum import Enum
from pydantic import BaseModel, Field, EmailStr
from typing import Optional
from uuid import UUID
from datetime import datetime


# =====================================================
# User/Auth Schemas
# =====================================================

class UserRole(str, Enum):
    """Roles de usuario."""
    USUARIO = "usuario"
    ADMINISTRADOR = "administrador"
    ADMINISTRADOR_MAESTRO = "administrador_maestro"


class UserProfile(BaseModel):
    """Perfil completo de usuario."""
    id: UUID
    email: str
    name: Optional[str]
    surname: Optional[str]
    role: UserRole
    location: Optional[str]
    is_active: bool
    created_at: datetime
    updated_at: datetime


class UserCreate(BaseModel):
    """Request para crear un nuevo usuario."""
    email: EmailStr
    name: str = Field(..., min_length=1, max_length=100)
    surname: str = Field(..., min_length=1, max_length=100)
    role: UserRole = UserRole.USUARIO
    location: Optional[str] = Field(None, max_length=200)
    password: str = Field(..., min_length=8)


class UserUpdate(BaseModel):
    """Request para actualizar un usuario."""
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    surname: Optional[str] = Field(None, min_length=1, max_length=100)
    role: Optional[UserRole] = None
    location: Optional[str] = Field(None, max_length=200)
    is_active: Optional[bool] = None


class UserResponse(BaseModel):
    """Response con información de usuario."""
    id: UUID
    email: str
    name: Optional[str]
    surname: Optional[str]
    role: UserRole
    location: Optional[str]
    is_active: bool
    created_at: datetime


class CurrentUser(BaseModel):
    """Usuario autenticado actual."""
    id: UUID
    email: str
    name: Optional[str]
    surname: Optional[str]
    role: UserRole


# =====================================================
# Chat Schemas
# =====================================================


class ChatRequest(BaseModel):
    """Request para el endpoint de chat."""
    question: str = Field(..., min_length=1, max_length=2000)
    manual_id: UUID


class ChunkReference(BaseModel):
    """Referencia a un chunk usado en la respuesta."""
    page_number: int
    section: Optional[str]
    similarity: float
    excerpt: str  # Extracto del contenido


class ChatResponse(BaseModel):
    """Response del endpoint de chat."""
    answer: str
    references: list[ChunkReference]
    manual_id: UUID


class ManualInfo(BaseModel):
    """Información básica de un manual."""
    id: UUID
    name: str
    description: Optional[str]
    equipment_type: Optional[str]
    total_pages: Optional[int]
    processed: bool
    created_at: Optional[datetime] = None


class HealthResponse(BaseModel):
    """Response del health check."""
    status: str
    version: str = "1.0.0"

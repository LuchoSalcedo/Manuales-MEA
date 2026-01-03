"""Aplicación principal FastAPI."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import get_settings
from app.models.schemas import HealthResponse
from app.api import chat, manuals, admin, pages, users
from app.api import settings as settings_api

settings = get_settings()

app = FastAPI(
    title="Manuales MEA API",
    description="API para consulta de manuales técnicos de equipos MEA",
    version="1.0.0"
)

# Configurar CORS
origins = settings.allowed_origins.split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Registrar routers
app.include_router(chat.router, prefix="/api")
app.include_router(manuals.router, prefix="/api")
app.include_router(admin.router, prefix="/api")
app.include_router(pages.router, prefix="/api")
app.include_router(users.router, prefix="/api")
app.include_router(settings_api.router, prefix="/api")


@app.get("/", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    """Health check endpoint."""
    return HealthResponse(status="healthy")


@app.get("/api/health", response_model=HealthResponse)
async def api_health_check() -> HealthResponse:
    """API health check endpoint."""
    return HealthResponse(status="healthy")

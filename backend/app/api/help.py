"""Endpoint de chat de ayuda para la aplicación."""

import re
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
import anthropic
from app.config import get_settings

router = APIRouter(prefix="/help", tags=["help"])

# Modelo fijo para ayuda (el más económico)
HELP_MODEL = "claude-3-5-haiku-20241022"

# Cache del manual de usuario
_manual_content: Optional[str] = None


def get_manual_content() -> str:
    """Lee y cachea el contenido del manual de usuario."""
    global _manual_content

    if _manual_content is not None:
        return _manual_content

    # Buscar el archivo MANUAL_USUARIO.md
    possible_paths = [
        Path(__file__).parent.parent.parent.parent / "MANUAL_USUARIO.md",
        Path("/opt/manuales-gse/MANUAL_USUARIO.md"),
        Path.cwd() / "MANUAL_USUARIO.md",
    ]

    for path in possible_paths:
        if path.exists():
            _manual_content = path.read_text(encoding="utf-8")
            return _manual_content

    raise FileNotFoundError("No se encontró el archivo MANUAL_USUARIO.md")


def extract_sections_from_response(answer: str, manual_content: str) -> list[str]:
    """Extrae las secciones mencionadas en la respuesta."""
    # Obtener títulos de secciones del manual (líneas que empiezan con ##)
    section_titles = re.findall(r'^##\s+(.+)$', manual_content, re.MULTILINE)

    # Buscar cuáles secciones se mencionan en la respuesta
    mentioned_sections = []
    answer_lower = answer.lower()

    for title in section_titles:
        # Limpiar el título de caracteres especiales para la búsqueda
        title_clean = title.lower().replace('*', '').strip()
        if title_clean in answer_lower or any(word in answer_lower for word in title_clean.split() if len(word) > 4):
            mentioned_sections.append(title)

    return mentioned_sections[:5]  # Máximo 5 secciones


class HelpRequest(BaseModel):
    """Request para el chat de ayuda."""
    question: str = Field(..., min_length=1, max_length=1000, description="Pregunta del usuario")


class HelpResponse(BaseModel):
    """Response del chat de ayuda."""
    answer: str
    sections: list[str] = []


class SectionResponse(BaseModel):
    """Response con el contenido de una sección."""
    title: str
    content: str


def get_section_content(section_title: str, manual_content: str) -> str | None:
    """Extrae el contenido de una sección específica del manual."""
    lines = manual_content.split('\n')
    in_section = False
    section_content = []

    for line in lines:
        # Detectar inicio de sección (## Título)
        if line.startswith('## '):
            if in_section:
                # Ya estábamos en una sección, terminamos
                break
            # Verificar si es la sección que buscamos
            title = line[3:].strip()
            if title.lower() == section_title.lower() or section_title.lower() in title.lower():
                in_section = True
                continue
        elif line.startswith('# ') and in_section:
            # Título principal, terminamos
            break
        elif in_section:
            section_content.append(line)

    if section_content:
        # Limpiar líneas vacías al inicio y final
        content = '\n'.join(section_content).strip()
        return content
    return None


@router.get("/sections")
async def get_sections():
    """Obtiene la lista de secciones disponibles del manual."""
    try:
        manual_content = get_manual_content()
    except FileNotFoundError as e:
        raise HTTPException(status_code=500, detail=str(e))

    section_titles = re.findall(r'^##\s+(.+)$', manual_content, re.MULTILINE)
    return {"sections": section_titles}


@router.get("/section/{section_name}", response_model=SectionResponse)
async def get_section(section_name: str):
    """Obtiene el contenido de una sección específica del manual."""
    try:
        manual_content = get_manual_content()
    except FileNotFoundError as e:
        raise HTTPException(status_code=500, detail=str(e))

    content = get_section_content(section_name, manual_content)

    if content is None:
        raise HTTPException(status_code=404, detail=f"Sección '{section_name}' no encontrada")

    return SectionResponse(title=section_name, content=content)


@router.post("/chat", response_model=HelpResponse)
async def help_chat(request: HelpRequest):
    """
    Chat de ayuda que responde preguntas sobre cómo usar la aplicación.
    Usa el contenido del MANUAL_USUARIO.md como fuente de conocimiento.
    """
    try:
        manual_content = get_manual_content()
    except FileNotFoundError as e:
        raise HTTPException(status_code=500, detail=str(e))

    # Obtener API key desde settings
    settings = get_settings()
    if not settings.anthropic_api_key:
        raise HTTPException(status_code=500, detail="ANTHROPIC_API_KEY no configurada")

    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

    system_prompt = f"""Eres el asistente de ayuda de la aplicación Manuales MEA.
Tu trabajo es ayudar a los usuarios a entender cómo usar la aplicación.

MANUAL DE USUARIO:
{manual_content}

INSTRUCCIONES:
- Responde SOLO con información del manual de usuario proporcionado
- Sé conciso y directo
- Usa formato markdown para listas y énfasis cuando sea apropiado
- Si la pregunta no está relacionada con el uso de la aplicación, indica amablemente que solo puedes ayudar con dudas sobre Manuales MEA
- Si no encuentras la información exacta, sugiere contactar al administrador
- Responde siempre en español
- No inventes funcionalidades que no estén en el manual"""

    try:
        message = client.messages.create(
            model=HELP_MODEL,
            max_tokens=1024,
            system=system_prompt,
            messages=[
                {"role": "user", "content": request.question}
            ]
        )

        answer = message.content[0].text
        sections = extract_sections_from_response(answer, manual_content)

        return HelpResponse(answer=answer, sections=sections)

    except anthropic.APIError as e:
        raise HTTPException(status_code=500, detail=f"Error de API: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error procesando pregunta: {str(e)}")

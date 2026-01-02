"""Endpoints de chat."""

from fastapi import APIRouter, HTTPException
from app.models.schemas import ChatRequest, ChatResponse
from app.services.rag_service import get_rag_service

router = APIRouter(prefix="/chat", tags=["chat"])


@router.post("/", response_model=ChatResponse)
async def chat(request: ChatRequest) -> ChatResponse:
    """
    Endpoint de chat RAG.

    Recibe una pregunta y el ID del manual, retorna la respuesta
    con referencias a las páginas del manual.
    """
    try:
        rag_service = get_rag_service()
        response = rag_service.query(
            question=request.question,
            manual_id=request.manual_id
        )
        return response

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error procesando la consulta: {str(e)}"
        )

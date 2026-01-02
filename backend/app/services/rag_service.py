"""Servicio RAG para consulta de manuales técnicos."""

from uuid import UUID
from openai import OpenAI
import anthropic
from app.config import get_settings
from app.services.supabase_client import get_supabase_client
from app.models.schemas import ChatResponse, ChunkReference

EMBEDDING_MODEL = "text-embedding-ada-002"


class RAGService:
    """Servicio de Retrieval-Augmented Generation."""

    def __init__(self):
        settings = get_settings()
        self.openai = OpenAI(api_key=settings.openai_api_key)
        self.anthropic = anthropic.Anthropic(api_key=settings.anthropic_api_key)
        self.supabase = get_supabase_client()
        self.top_k = settings.rag_top_k
        self.similarity_threshold = settings.rag_similarity_threshold

    def get_embedding(self, text: str) -> list[float]:
        """Genera embedding para un texto usando OpenAI."""
        response = self.openai.embeddings.create(
            model=EMBEDDING_MODEL,
            input=text
        )
        return response.data[0].embedding

    def search_similar_chunks(self, query_embedding: list[float], manual_id: UUID) -> list[dict]:
        """Busca chunks similares en Supabase usando pgvector."""
        try:
            # Intentar usar la función RPC (más eficiente)
            response = self.supabase.rpc(
                "search_chunks",
                {
                    "query_embedding": query_embedding,
                    "match_count": self.top_k,
                    "filter_manual_id": str(manual_id)
                }
            ).execute()

            chunks = response.data

        except Exception as e:
            # Fallback: búsqueda directa sin función RPC
            print(f"RPC no disponible, usando búsqueda directa: {e}")
            response = self.supabase.table("chunks") \
                .select("id, manual_id, content, page_number, section, embedding") \
                .eq("manual_id", str(manual_id)) \
                .limit(self.top_k * 2) \
                .execute()

            # Calcular similitud manualmente (cosine similarity)
            chunks = []
            for chunk in response.data:
                if chunk.get("embedding"):
                    # El embedding puede venir como string, convertir a lista
                    emb = chunk["embedding"]
                    if isinstance(emb, str):
                        import json
                        emb = json.loads(emb)
                    similarity = self._cosine_similarity(query_embedding, emb)
                    chunk["similarity"] = similarity
                    del chunk["embedding"]  # No necesitamos el embedding en la respuesta
                    chunks.append(chunk)

            # Ordenar por similitud
            chunks.sort(key=lambda x: x.get("similarity", 0), reverse=True)
            chunks = chunks[:self.top_k]

        # Filtrar por umbral de similitud
        chunks = [
            chunk for chunk in chunks
            if chunk.get("similarity", 0) >= self.similarity_threshold
        ]

        return chunks

    def _cosine_similarity(self, vec1: list[float], vec2: list[float]) -> float:
        """Calcula similitud coseno entre dos vectores."""
        import math
        dot_product = sum(a * b for a, b in zip(vec1, vec2))
        norm1 = math.sqrt(sum(a * a for a in vec1))
        norm2 = math.sqrt(sum(b * b for b in vec2))
        if norm1 == 0 or norm2 == 0:
            return 0.0
        return dot_product / (norm1 * norm2)

    def build_context(self, chunks: list[dict]) -> str:
        """Construye el contexto para Claude a partir de los chunks."""
        if not chunks:
            return "No se encontró información relevante en el manual."

        context_parts = []
        for i, chunk in enumerate(chunks, 1):
            page = chunk.get("page_number", "?")
            section = chunk.get("section", "Sin sección")
            content = chunk.get("content", "")

            context_parts.append(
                f"[Fragmento {i} - Página {page}, {section}]\n{content}"
            )

        return "\n\n---\n\n".join(context_parts)

    def generate_answer(self, question: str, context: str) -> str:
        """Genera respuesta usando Claude con el contexto proporcionado."""
        system_prompt = """Eres un asistente técnico especializado en manuales de equipos de ground handling para aeropuertos.

Tu trabajo es responder preguntas basándote ÚNICAMENTE en la información proporcionada en el contexto.

Reglas CRÍTICAS:
1. Responde SOLO con información del contexto que sea DIRECTAMENTE relevante a la pregunta
2. Si la información no está en el contexto, di "No encontré esa información en el manual"
3. PRESERVA LA ESTRUCTURA ORIGINAL del manual:
   - Si el manual usa letras (A, B, C), usa las mismas letras
   - Si usa números (1, 2, 3), usa los mismos números
   - Si tiene sub-items ((1), (2), (3)), mantén esa jerarquía
   - NO reorganices ni parafrasees la información - preséntala como aparece
4. IMPORTANTE: En tablas de troubleshooting, responde SOLO sobre el síntoma/problema específico preguntado
   - NO incluyas causas o remedios de otros problemas aunque aparezcan en el contexto
   - Cada problema tiene sus propias causas (A, B, C...) - no mezcles con otros problemas
5. Cita SOLO las páginas donde encontraste la información de la respuesta
6. Sé preciso - los técnicos necesitan información EXACTA como aparece en el manual
7. Si hay especificaciones técnicas (voltajes, presiones, medidas), cópialas exactamente
8. Responde en español pero mantén términos técnicos en inglés si así aparecen

Formato de respuesta:
- Presenta la información COMPLETA respetando la estructura del manual original
- NO cortes la respuesta - incluye TODOS los pasos, procedimientos o información relevante
- OBLIGATORIO al final: (Ver páginas X, Y, Z) - lista TODAS las páginas de donde sacaste información"""

        user_prompt = f"""Contexto del manual:
{context}

---

Pregunta del usuario: {question}"""

        message = self.anthropic.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=4096,
            system=system_prompt,
            messages=[
                {"role": "user", "content": user_prompt}
            ]
        )

        return message.content[0].text

    def _extract_cited_pages(self, answer: str) -> set[int]:
        """Extrae los números de página citados en la respuesta."""
        import re
        # Buscar patrones como "página 187", "page 187", "pág. 187", "páginas 7, 9, 10"
        patterns = [
            r'p[áa]ginas?\s+(\d+(?:\s*[,y]\s*\d+)*)',  # página 187 o páginas 7, 9 y 10
            r'pages?\s+(\d+(?:\s*[,and]\s*\d+)*)',      # page 187 o pages 7, 9 and 10
            r'p[áa]g\.?\s*(\d+)',                        # pág. 187
        ]

        cited_pages = set()
        for pattern in patterns:
            matches = re.findall(pattern, answer, re.IGNORECASE)
            for match in matches:
                # Extraer todos los números del match
                numbers = re.findall(r'\d+', match)
                cited_pages.update(int(n) for n in numbers)

        return cited_pages

    def query(self, question: str, manual_id: UUID) -> ChatResponse:
        """Ejecuta el pipeline RAG completo."""
        # 1. Generar embedding de la pregunta
        query_embedding = self.get_embedding(question)

        # 2. Buscar chunks similares
        chunks = self.search_similar_chunks(query_embedding, manual_id)

        # 3. Construir contexto
        context = self.build_context(chunks)

        # 4. Generar respuesta con Claude
        answer = self.generate_answer(question, context)

        # 5. Extraer páginas citadas en la respuesta
        cited_pages = self._extract_cited_pages(answer)

        # 6. Preparar referencias - mostrar TODAS las fuentes usadas
        references = []
        seen_pages = set()  # Evitar duplicados

        for chunk in chunks:
            page_number = chunk.get("page_number", 0)

            # Evitar duplicados de la misma página
            if page_number in seen_pages:
                continue
            seen_pages.add(page_number)

            content = chunk.get("content", "")
            excerpt = content[:150] + "..." if len(content) > 150 else content

            references.append(ChunkReference(
                page_number=page_number,
                section=chunk.get("section"),
                similarity=round(chunk.get("similarity", 0), 3),
                excerpt=excerpt
            ))

        # Ordenar referencias por número de página
        references.sort(key=lambda r: r.page_number)

        return ChatResponse(
            answer=answer,
            references=references,
            manual_id=manual_id
        )


# Singleton
_rag_service: RAGService | None = None


def get_rag_service() -> RAGService:
    """Obtiene la instancia del servicio RAG."""
    global _rag_service
    if _rag_service is None:
        _rag_service = RAGService()
    return _rag_service

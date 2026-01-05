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
        chunks = []
        use_fallback = False

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

            # Si RPC devuelve vacío, usar fallback
            if not chunks:
                use_fallback = True

        except Exception as e:
            print(f"RPC no disponible: {e}")
            use_fallback = True

        # Fallback: búsqueda directa con cálculo manual de similitud
        if use_fallback:
            print("Usando búsqueda directa con cálculo manual de similitud")
            response = self.supabase.table("chunks") \
                .select("id, manual_id, content, page_number, section, embedding") \
                .eq("manual_id", str(manual_id)) \
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
- OBLIGATORIO: Usa formato MARKDOWN para mejor legibilidad:
  * Para CUALQUIER dato tabular (especificaciones, capacidades, torques, intervalos, troubleshooting, etc.) usa TABLAS markdown:
    | Columna 1 | Columna 2 | Columna 3 |
    |-----------|-----------|-----------|
    | Dato 1 | Dato 2 | Dato 3 |
  * Para listas de pasos usa números (1. 2. 3.)
  * Para listas de items usa bullets (- item)
  * Para énfasis usa **negritas**
  * Siempre que veas datos tipo "X: valor, Y: valor, Z: valor" conviértelos a tabla
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

    def generate_answer_with_model(self, question: str, context: str, model: str) -> tuple[str, dict]:
        """
        Genera respuesta usando un modelo específico de Claude.
        Retorna la respuesta y métricas de uso.
        """
        import time

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
- OBLIGATORIO: Usa formato MARKDOWN para mejor legibilidad:
  * Para CUALQUIER dato tabular (especificaciones, capacidades, torques, intervalos, troubleshooting, etc.) usa TABLAS markdown:
    | Columna 1 | Columna 2 | Columna 3 |
    |-----------|-----------|-----------|
    | Dato 1 | Dato 2 | Dato 3 |
  * Para listas de pasos usa números (1. 2. 3.)
  * Para listas de items usa bullets (- item)
  * Para énfasis usa **negritas**
  * Siempre que veas datos tipo "X: valor, Y: valor, Z: valor" conviértelos a tabla
- OBLIGATORIO al final: (Ver páginas X, Y, Z) - lista TODAS las páginas de donde sacaste información"""

        user_prompt = f"""Contexto del manual:
{context}

---

Pregunta del usuario: {question}"""

        start_time = time.time()

        message = self.anthropic.messages.create(
            model=model,
            max_tokens=4096,
            system=system_prompt,
            messages=[
                {"role": "user", "content": user_prompt}
            ]
        )

        latency_ms = int((time.time() - start_time) * 1000)

        metrics = {
            "model": model,
            "latency_ms": latency_ms,
            "input_tokens": message.usage.input_tokens,
            "output_tokens": message.usage.output_tokens,
        }

        return message.content[0].text, metrics

    def query_with_model(self, question: str, manual_id: UUID, model: str) -> tuple[ChatResponse, dict]:
        """
        Ejecuta el pipeline RAG completo con un modelo específico.
        Retorna la respuesta y métricas detalladas.
        """
        import time

        total_start = time.time()

        # 1. Generar embedding de la pregunta
        embed_start = time.time()
        query_embedding = self.get_embedding(question)
        embed_time = int((time.time() - embed_start) * 1000)

        # 2. Buscar chunks similares
        search_start = time.time()
        chunks = self.search_similar_chunks(query_embedding, manual_id)
        search_time = int((time.time() - search_start) * 1000)

        # 3. Construir contexto
        context = self.build_context(chunks)

        # 4. Generar respuesta con Claude (modelo específico)
        answer, model_metrics = self.generate_answer_with_model(question, context, model)

        # 5. Extraer páginas citadas en la respuesta
        cited_pages = self._extract_cited_pages(answer)

        # 6. Preparar referencias
        references = []
        seen_pages = set()
        page_to_chunk = {}
        for chunk in chunks:
            page_number = chunk.get("page_number", 0)
            if page_number not in page_to_chunk:
                page_to_chunk[page_number] = chunk

        for page_number in cited_pages:
            if page_number in seen_pages:
                continue
            seen_pages.add(page_number)

            chunk = page_to_chunk.get(page_number)
            if chunk:
                content = chunk.get("content", "")
                excerpt = content[:150] + "..." if len(content) > 150 else content
                section = chunk.get("section")
                similarity = round(chunk.get("similarity", 0), 3)
            else:
                excerpt = ""
                section = None
                similarity = 0.0

            references.append(ChunkReference(
                page_number=page_number,
                section=section,
                similarity=similarity,
                excerpt=excerpt
            ))

        references.sort(key=lambda r: r.page_number)

        total_time = int((time.time() - total_start) * 1000)

        # Calcular similitud promedio
        avg_similarity = 0.0
        if chunks:
            avg_similarity = sum(c.get("similarity", 0) for c in chunks) / len(chunks)

        # Métricas completas
        metrics = {
            **model_metrics,
            "total_latency_ms": total_time,
            "embedding_time_ms": embed_time,
            "search_time_ms": search_time,
            "chunks_retrieved": len(chunks),
            "avg_similarity": round(avg_similarity, 4),
            "pages_cited": len(cited_pages),
        }

        response = ChatResponse(
            answer=answer,
            references=references,
            manual_id=manual_id
        )

        return response, metrics

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

        # 6. Preparar referencias - mostrar SOLO las páginas citadas en la respuesta
        references = []
        seen_pages = set()  # Evitar duplicados

        # Crear un mapa de página -> chunk para acceso rápido
        page_to_chunk = {}
        for chunk in chunks:
            page_number = chunk.get("page_number", 0)
            if page_number not in page_to_chunk:
                page_to_chunk[page_number] = chunk

        # Solo incluir referencias de páginas que Claude citó en su respuesta
        for page_number in cited_pages:
            if page_number in seen_pages:
                continue
            seen_pages.add(page_number)

            # Buscar el chunk correspondiente
            chunk = page_to_chunk.get(page_number)
            if chunk:
                content = chunk.get("content", "")
                excerpt = content[:150] + "..." if len(content) > 150 else content
                section = chunk.get("section")
                similarity = round(chunk.get("similarity", 0), 3)
            else:
                # Página citada pero no está en los chunks recuperados
                excerpt = ""
                section = None
                similarity = 0.0

            references.append(ChunkReference(
                page_number=page_number,
                section=section,
                similarity=similarity,
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

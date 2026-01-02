"""Script para probar el sistema RAG."""

import sys
from pathlib import Path

# Agregar backend al path
backend_path = Path(__file__).parent.parent / "backend"
sys.path.insert(0, str(backend_path))

from app.services.rag_service import get_rag_service
from uuid import UUID


def test_rag(manual_id: str, question: str):
    """Prueba el sistema RAG con una pregunta."""
    print(f"\n{'='*60}")
    print(f"Pregunta: {question}")
    print(f"Manual ID: {manual_id}")
    print(f"{'='*60}\n")

    rag = get_rag_service()

    print("1. Generando embedding de la pregunta...")
    embedding = rag.get_embedding(question)
    print(f"   Embedding generado ({len(embedding)} dimensiones)")

    print("\n2. Buscando chunks similares...")
    chunks = rag.search_similar_chunks(embedding, UUID(manual_id))
    print(f"   Chunks encontrados: {len(chunks)}")

    if chunks:
        for i, chunk in enumerate(chunks, 1):
            print(f"\n   Chunk {i}:")
            print(f"   - Página: {chunk.get('page_number')}")
            print(f"   - Sección: {chunk.get('section')}")
            print(f"   - Similitud: {chunk.get('similarity', 0):.3f}")
            content = chunk.get('content', '')[:100]
            print(f"   - Extracto: {content}...")

    print("\n3. Generando respuesta con Claude...")
    response = rag.query(question, UUID(manual_id))

    print(f"\n{'='*60}")
    print("RESPUESTA:")
    print(f"{'='*60}")
    print(response.answer)

    if response.references:
        print(f"\n{'='*60}")
        print("REFERENCIAS:")
        print(f"{'='*60}")
        for ref in response.references:
            print(f"- Página {ref.page_number} ({ref.section}): similitud {ref.similarity}")


def main():
    if len(sys.argv) < 3:
        print("Uso: python test_rag.py <manual_id> <pregunta>")
        print("Ejemplo: python test_rag.py abc123 '¿Cuál es el voltaje de operación?'")
        sys.exit(1)

    manual_id = sys.argv[1]
    question = " ".join(sys.argv[2:])

    test_rag(manual_id, question)


if __name__ == "__main__":
    main()

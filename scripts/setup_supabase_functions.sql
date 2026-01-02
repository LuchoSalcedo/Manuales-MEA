-- Función de búsqueda semántica para el sistema RAG
-- Ejecutar en Supabase SQL Editor

-- Función para buscar chunks similares usando pgvector
CREATE OR REPLACE FUNCTION search_chunks(
    query_embedding vector(1536),
    match_count int DEFAULT 5,
    filter_manual_id uuid DEFAULT NULL
)
RETURNS TABLE (
    id uuid,
    manual_id uuid,
    content text,
    page_number int,
    section text,
    similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        chunks.id,
        chunks.manual_id,
        chunks.content,
        chunks.page_number,
        chunks.section,
        1 - (chunks.embedding <=> query_embedding) AS similarity
    FROM chunks
    WHERE
        (filter_manual_id IS NULL OR chunks.manual_id = filter_manual_id)
    ORDER BY chunks.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- Índice para búsqueda vectorial eficiente (usar después de tener datos)
-- CREATE INDEX IF NOT EXISTS chunks_embedding_idx ON chunks
-- USING ivfflat (embedding vector_cosine_ops)
-- WITH (lists = 100);

-- Verificar que la función existe
SELECT proname, proargnames
FROM pg_proc
WHERE proname = 'search_chunks';

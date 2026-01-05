-- =============================================================================
-- Migración: Crear función de búsqueda híbrida
-- =============================================================================
-- Esta función combina búsqueda semántica (pgvector) con Full-Text Search
-- para mejorar la precisión en consultas con términos técnicos.
-- =============================================================================

-- Eliminar función anterior si existe
DROP FUNCTION IF EXISTS search_chunks_hybrid(vector(1536), text, int, uuid, float);

-- Crear función de búsqueda híbrida
CREATE OR REPLACE FUNCTION search_chunks_hybrid(
    query_embedding vector(1536),
    query_text text,
    match_count int DEFAULT 10,
    filter_manual_id uuid DEFAULT NULL,
    semantic_weight float DEFAULT 0.6
)
RETURNS TABLE (
    id uuid,
    manual_id uuid,
    content text,
    page_number int,
    section text,
    semantic_similarity float,
    keyword_score float,
    combined_score float
)
LANGUAGE plpgsql
AS $$
DECLARE
    keyword_weight float := 1.0 - semantic_weight;
    max_keyword_score float;
BEGIN
    -- Calcular el score máximo de keywords para normalización
    SELECT MAX(
        CASE
            WHEN c.search_vector @@ plainto_tsquery('english', query_text)
            THEN ts_rank_cd(c.search_vector, plainto_tsquery('english', query_text))
            ELSE 0.0
        END
    ) INTO max_keyword_score
    FROM chunks c
    WHERE filter_manual_id IS NULL OR c.manual_id = filter_manual_id;

    -- Si no hay matches de keywords, usar 1 para evitar división por cero
    IF max_keyword_score IS NULL OR max_keyword_score = 0 THEN
        max_keyword_score := 1.0;
    END IF;

    RETURN QUERY
    SELECT
        c.id,
        c.manual_id,
        c.content,
        c.page_number,
        c.section,
        -- Score semántico (similitud coseno) - maneja NULL embedding
        CASE
            WHEN query_embedding IS NOT NULL THEN (1 - (c.embedding <=> query_embedding))::float
            ELSE 0.0
        END AS semantic_similarity,
        -- Score de keywords (normalizado 0-1)
        (CASE
            WHEN c.search_vector @@ plainto_tsquery('english', query_text)
            THEN ts_rank_cd(c.search_vector, plainto_tsquery('english', query_text)) / max_keyword_score
            ELSE 0.0
        END)::float AS keyword_score,
        -- Score combinado (maneja NULL embedding)
        (CASE
            WHEN query_embedding IS NOT NULL THEN
                semantic_weight * (1 - (c.embedding <=> query_embedding)) +
                keyword_weight * (
                    CASE
                        WHEN c.search_vector @@ plainto_tsquery('english', query_text)
                        THEN ts_rank_cd(c.search_vector, plainto_tsquery('english', query_text)) / max_keyword_score
                        ELSE 0.0
                    END
                )
            ELSE
                -- Sin embedding, usar solo keyword score
                (CASE
                    WHEN c.search_vector @@ plainto_tsquery('english', query_text)
                    THEN ts_rank_cd(c.search_vector, plainto_tsquery('english', query_text)) / max_keyword_score
                    ELSE 0.0
                END)
        END)::float AS combined_score
    FROM chunks c
    WHERE filter_manual_id IS NULL OR c.manual_id = filter_manual_id
    ORDER BY combined_score DESC
    LIMIT match_count;
END;
$$;

-- Otorgar permisos
GRANT EXECUTE ON FUNCTION search_chunks_hybrid TO authenticated;
GRANT EXECUTE ON FUNCTION search_chunks_hybrid TO anon;
GRANT EXECUTE ON FUNCTION search_chunks_hybrid TO service_role;

-- Verificar creación
DO $$
BEGIN
    RAISE NOTICE 'Función search_chunks_hybrid creada correctamente';
END $$;

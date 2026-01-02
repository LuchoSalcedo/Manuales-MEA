-- =====================================================
-- Create search_chunks function for vector similarity search
-- Run this in Supabase SQL Editor
-- =====================================================

-- Enable pgvector extension if not already enabled
CREATE EXTENSION IF NOT EXISTS vector;

-- Create the search function
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
        c.id,
        c.manual_id,
        c.content,
        c.page_number,
        c.section,
        1 - (c.embedding <=> query_embedding) AS similarity
    FROM chunks c
    WHERE
        (filter_manual_id IS NULL OR c.manual_id = filter_manual_id)
    ORDER BY c.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION search_chunks TO authenticated;
GRANT EXECUTE ON FUNCTION search_chunks TO anon;
GRANT EXECUTE ON FUNCTION search_chunks TO service_role;

-- Test the function (optional - run separately)
-- SELECT * FROM search_chunks(
--     (SELECT embedding FROM chunks LIMIT 1),
--     5,
--     'a3a4c41e-b021-49a1-a5e2-2639d96f8922'::uuid
-- );

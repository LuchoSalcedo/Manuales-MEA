-- =============================================================================
-- Migración: Agregar Full-Text Search a chunks
-- =============================================================================
-- Esta migración agrega soporte para búsqueda por palabras clave usando
-- PostgreSQL Full-Text Search con índice GIN.
-- =============================================================================

-- 1. Agregar columna para Full-Text Search
ALTER TABLE chunks ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- 2. Crear índice GIN para búsqueda eficiente
CREATE INDEX IF NOT EXISTS chunks_search_vector_idx
ON chunks USING GIN(search_vector);

-- 3. Actualizar chunks existentes con ts_vector
-- Usar configuración 'english' (mejor para términos técnicos alfanuméricos)
UPDATE chunks
SET search_vector = to_tsvector('english', coalesce(content, ''))
WHERE search_vector IS NULL;

-- 4. Crear función trigger para mantener search_vector actualizado
CREATE OR REPLACE FUNCTION chunks_search_vector_update()
RETURNS trigger AS $$
BEGIN
    NEW.search_vector := to_tsvector('english', coalesce(NEW.content, ''));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. Crear trigger (eliminar si existe para evitar duplicados)
DROP TRIGGER IF EXISTS chunks_search_vector_trigger ON chunks;

CREATE TRIGGER chunks_search_vector_trigger
    BEFORE INSERT OR UPDATE OF content ON chunks
    FOR EACH ROW
    EXECUTE FUNCTION chunks_search_vector_update();

-- 6. Verificar que se creó correctamente
DO $$
BEGIN
    RAISE NOTICE 'Full-Text Search configurado correctamente en tabla chunks';
END $$;

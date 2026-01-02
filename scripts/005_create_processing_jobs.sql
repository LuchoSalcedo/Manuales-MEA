-- =====================================================
-- Create processing_jobs table for pause/resume/cancel
-- Run this in Supabase SQL Editor
-- =====================================================

-- Tabla para persistir estado de procesamiento
CREATE TABLE IF NOT EXISTS processing_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    manual_id UUID REFERENCES manuals(id) ON DELETE SET NULL,
    pdf_path TEXT NOT NULL,
    manual_name TEXT NOT NULL,

    -- Estado del job
    status TEXT DEFAULT 'queued' CHECK (status IN (
        'queued', 'detecting', 'extracting', 'ocr',
        'chunking', 'embeddings', 'saving',
        'paused', 'completed', 'cancelled', 'error'
    )),

    -- Progreso
    current_page INT DEFAULT 0,
    total_pages INT DEFAULT 0,
    message TEXT,

    -- Datos de detección de tipo de PDF
    pdf_type TEXT CHECK (pdf_type IN ('digital', 'scanned', 'hybrid')),
    digital_pages JSONB DEFAULT '[]',
    ocr_pages JSONB DEFAULT '[]',
    pages_with_images INT DEFAULT 0,

    -- Páginas procesadas (para resume)
    processed_pages JSONB DEFAULT '[]',

    -- Metadatos
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    paused_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    error_message TEXT
);

-- Índice para búsqueda rápida por estado
CREATE INDEX IF NOT EXISTS idx_processing_jobs_status ON processing_jobs(status);

-- Índice para búsqueda por manual
CREATE INDEX IF NOT EXISTS idx_processing_jobs_manual_id ON processing_jobs(manual_id);

-- Trigger para actualizar updated_at
CREATE OR REPLACE FUNCTION update_processing_jobs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_processing_jobs_updated_at ON processing_jobs;
CREATE TRIGGER trigger_processing_jobs_updated_at
    BEFORE UPDATE ON processing_jobs
    FOR EACH ROW
    EXECUTE FUNCTION update_processing_jobs_updated_at();

-- RLS Policies
ALTER TABLE processing_jobs ENABLE ROW LEVEL SECURITY;

-- Admins pueden ver y modificar todos los jobs
CREATE POLICY "Admins can view all jobs"
    ON processing_jobs FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('administrador', 'administrador_maestro')
        )
    );

CREATE POLICY "Admins can insert jobs"
    ON processing_jobs FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('administrador', 'administrador_maestro')
        )
    );

CREATE POLICY "Admins can update jobs"
    ON processing_jobs FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('administrador', 'administrador_maestro')
        )
    );

CREATE POLICY "Admins can delete jobs"
    ON processing_jobs FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('administrador', 'administrador_maestro')
        )
    );

-- Service role puede hacer todo (para el backend)
CREATE POLICY "Service role full access"
    ON processing_jobs FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Grant permissions
GRANT ALL ON processing_jobs TO authenticated;
GRANT ALL ON processing_jobs TO service_role;

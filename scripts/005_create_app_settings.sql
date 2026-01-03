-- =====================================================
-- Create app_settings table for global configuration
-- Run this in Supabase SQL Editor
-- =====================================================

-- Create table for global application settings
CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    description TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    updated_by UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone authenticated can read settings
CREATE POLICY "Authenticated users can read settings"
    ON app_settings FOR SELECT
    TO authenticated
    USING (true);

-- Policy: Only master admin can update settings
CREATE POLICY "Master admin can update settings"
    ON app_settings FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'administrador_maestro'
        )
    );

-- Policy: Only master admin can insert settings
CREATE POLICY "Master admin can insert settings"
    ON app_settings FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'administrador_maestro'
        )
    );

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_app_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_app_settings_updated_at
    BEFORE UPDATE ON app_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_app_settings_updated_at();

-- Insert default settings
INSERT INTO app_settings (key, value, description) VALUES
    ('anthropic_model', '"claude-sonnet-4-20250514"', 'Modelo de Anthropic para el chat RAG'),
    ('max_upload_size_mb', '50', 'Tamano maximo de archivo para upload en MB')
ON CONFLICT (key) DO NOTHING;

-- Verify settings were created
SELECT * FROM app_settings;

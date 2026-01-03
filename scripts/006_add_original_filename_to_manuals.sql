-- =====================================================
-- Add original_filename column to manuals table
-- Run this in Supabase SQL Editor
-- =====================================================

-- Add column to store the original PDF filename
ALTER TABLE manuals
ADD COLUMN IF NOT EXISTS original_filename TEXT;

-- Verify column was added
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'manuals' AND column_name = 'original_filename';

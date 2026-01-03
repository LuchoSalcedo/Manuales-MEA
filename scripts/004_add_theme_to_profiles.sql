-- =====================================================
-- Add theme column to profiles table
-- Run this in Supabase SQL Editor
-- =====================================================

-- Add theme column with default 'light'
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS theme TEXT DEFAULT 'light'
CHECK (theme IN ('light', 'dark'));

-- Update existing rows to have 'light' theme if null
UPDATE profiles SET theme = 'light' WHERE theme IS NULL;

-- Verify the column was added
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'profiles' AND column_name = 'theme';

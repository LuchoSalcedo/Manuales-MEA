-- =====================================================
-- FIX: Simplify RLS policies for profiles table
-- Run this in Supabase SQL Editor
-- =====================================================

-- Drop all existing SELECT policies
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;

-- Create a simple policy that allows users to see their own profile
-- and admins to see all profiles using a security definer function

-- First, create a function to check if the current user is an admin
-- This uses SECURITY DEFINER to bypass RLS
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
DECLARE
    user_role TEXT;
BEGIN
    SELECT role INTO user_role
    FROM profiles
    WHERE id = auth.uid();

    RETURN user_role IN ('administrador', 'administrador_maestro');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Now create a single SELECT policy that covers both cases
CREATE POLICY "Users can view profiles"
    ON profiles FOR SELECT
    USING (
        id = auth.uid()  -- Users can always see their own profile
        OR is_admin()     -- Admins can see all profiles
    );

-- =====================================================
-- Verify the policy was created
-- =====================================================
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE tablename = 'profiles' AND cmd = 'SELECT';

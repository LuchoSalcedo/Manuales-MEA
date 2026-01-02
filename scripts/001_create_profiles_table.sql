-- =====================================================
-- Migration: Create profiles table for RBAC
-- Run this in Supabase SQL Editor
-- =====================================================

-- 1. Create profiles table
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    name TEXT,
    surname TEXT,
    role TEXT DEFAULT 'usuario' CHECK (role IN ('usuario', 'administrador', 'administrador_maestro')),
    location TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id)
);

-- 2. Create indexes
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_is_active ON profiles(is_active);

-- 3. Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;
CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 4. Constraint: Only one administrador_maestro can exist
CREATE OR REPLACE FUNCTION check_single_master_admin()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.role = 'administrador_maestro' THEN
        IF EXISTS (
            SELECT 1 FROM profiles
            WHERE role = 'administrador_maestro'
            AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
        ) THEN
            RAISE EXCEPTION 'Solo puede existir un Administrador Maestro';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS enforce_single_master_admin ON profiles;
CREATE TRIGGER enforce_single_master_admin
    BEFORE INSERT OR UPDATE ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION check_single_master_admin();

-- 5. Function to create profile on user signup (auto)
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, name, surname, role)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'name', ''),
        COALESCE(NEW.raw_user_meta_data->>'surname', ''),
        COALESCE(NEW.raw_user_meta_data->>'role', 'usuario')
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Trigger to auto-create profile on signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION handle_new_user();

-- 7. Enable Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- 8. RLS Policies

-- Policy: Users can view their own profile
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
CREATE POLICY "Users can view own profile"
    ON profiles FOR SELECT
    USING (auth.uid() = id);

-- Policy: Admins can view all profiles
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
CREATE POLICY "Admins can view all profiles"
    ON profiles FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
            AND role IN ('administrador', 'administrador_maestro')
        )
    );

-- Policy: Admins can insert new users
DROP POLICY IF EXISTS "Admins can insert users" ON profiles;
CREATE POLICY "Admins can insert users"
    ON profiles FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
            AND role IN ('administrador', 'administrador_maestro')
        )
    );

-- Policy: Users can update their own profile (limited)
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile"
    ON profiles FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- Policy: Admins can update users based on role
DROP POLICY IF EXISTS "Admins can update users" ON profiles;
CREATE POLICY "Admins can update users"
    ON profiles FOR UPDATE
    USING (
        -- Admin updating Usuario
        (
            EXISTS (
                SELECT 1 FROM profiles
                WHERE id = auth.uid() AND role = 'administrador'
            )
            AND role = 'usuario'
        )
        OR
        -- Master admin can update anyone
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role = 'administrador_maestro'
        )
    );

-- Policy: Admins can delete users based on role
DROP POLICY IF EXISTS "Admins can delete users" ON profiles;
CREATE POLICY "Admins can delete users"
    ON profiles FOR DELETE
    USING (
        -- Admin deleting Usuario only
        (
            EXISTS (
                SELECT 1 FROM profiles
                WHERE id = auth.uid() AND role = 'administrador'
            )
            AND role = 'usuario'
        )
        OR
        -- Master admin can delete anyone except themselves
        (
            EXISTS (
                SELECT 1 FROM profiles
                WHERE id = auth.uid() AND role = 'administrador_maestro'
            )
            AND id != auth.uid()
        )
    );

-- =====================================================
-- 9. MIGRATION: Create profiles for existing users
-- =====================================================

-- Insert profiles for existing auth.users that don't have one
INSERT INTO profiles (id, email, role)
SELECT id, email, 'usuario'
FROM auth.users
WHERE id NOT IN (SELECT id FROM profiles)
ON CONFLICT (id) DO NOTHING;

-- =====================================================
-- 10. Set initial Master Admin
-- Replace email if different
-- =====================================================

UPDATE profiles
SET
    role = 'administrador_maestro',
    name = 'Luis',
    surname = 'Salcedo'
WHERE email = 'luchosalcedo@me.com';

-- Verify
SELECT id, email, name, surname, role, is_active FROM profiles;

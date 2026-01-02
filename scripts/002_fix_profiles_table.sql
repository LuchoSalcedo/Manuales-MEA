-- =====================================================
-- FIX: Add missing columns to existing profiles table
-- Run this in Supabase SQL Editor
-- =====================================================

-- Add missing columns if they don't exist
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS surname TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'usuario' CHECK (role IN ('usuario', 'administrador', 'administrador_maestro'));
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);

-- Create indexes (ignore if exist)
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
        (
            EXISTS (
                SELECT 1 FROM profiles
                WHERE id = auth.uid() AND role = 'administrador'
            )
            AND role = 'usuario'
        )
        OR
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
        (
            EXISTS (
                SELECT 1 FROM profiles
                WHERE id = auth.uid() AND role = 'administrador'
            )
            AND role = 'usuario'
        )
        OR
        (
            EXISTS (
                SELECT 1 FROM profiles
                WHERE id = auth.uid() AND role = 'administrador_maestro'
            )
            AND id != auth.uid()
        )
    );

-- =====================================================
-- 9. Update existing profiles with default values
-- =====================================================

UPDATE profiles
SET
    role = COALESCE(role, 'usuario'),
    is_active = COALESCE(is_active, true)
WHERE role IS NULL OR is_active IS NULL;

-- =====================================================
-- 10. Set initial Master Admin
-- =====================================================

UPDATE profiles
SET
    role = 'administrador_maestro',
    name = 'Luis',
    surname = 'Salcedo',
    is_active = true
WHERE email = 'luchosalcedo@me.com';

-- Verify
SELECT id, email, name, surname, role, is_active FROM profiles;

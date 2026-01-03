'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { User, Session } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase'
import { UserProfile, Theme } from '@/types'

interface AuthContextType {
  user: User | null
  session: Session | null
  profile: UserProfile | null
  loading: boolean
  isAdmin: boolean
  isMasterAdmin: boolean
  theme: Theme
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
  setTheme: (theme: Theme) => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  profile: null,
  loading: true,
  isAdmin: false,
  isMasterAdmin: false,
  theme: 'light',
  signOut: async () => {},
  refreshProfile: async () => {},
  setTheme: async () => {},
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [theme, setThemeState] = useState<Theme>('light')
  const supabase = createClient()

  // Apply theme to document
  const applyTheme = (newTheme: Theme) => {
    if (typeof document !== 'undefined') {
      document.documentElement.classList.remove('light', 'dark')
      document.documentElement.classList.add(newTheme)
      localStorage.setItem('theme', newTheme)
    }
  }

  // Initialize theme from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedTheme = localStorage.getItem('theme') as Theme | null
      if (savedTheme && (savedTheme === 'light' || savedTheme === 'dark')) {
        setThemeState(savedTheme)
        applyTheme(savedTheme)
      }
    }
  }, [])

  const fetchProfile = async (userId: string) => {
    try {
      console.log('Fetching profile for userId:', userId)

      const { data, error, status, statusText } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()

      console.log('Profile fetch result:', { data, error, status, statusText })

      if (data && !error) {
        console.log('Profile loaded successfully:', data)
        const profileData = data as UserProfile
        setProfile(profileData)
        // Sync theme from profile
        if (profileData.theme) {
          setThemeState(profileData.theme)
          applyTheme(profileData.theme)
        }
      } else {
        console.error('Error fetching profile:', {
          error,
          errorMessage: error?.message,
          errorDetails: error?.details,
          errorHint: error?.hint,
          errorCode: error?.code,
          status,
          statusText
        })
        setProfile(null)
      }
    } catch (err) {
      console.error('Exception fetching profile:', err)
      setProfile(null)
    }
  }

  const refreshProfile = async () => {
    if (user?.id) {
      await fetchProfile(user.id)
    }
  }

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) {
        fetchProfile(session.user.id)
      }
      setLoading(false)
    })

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) {
        fetchProfile(session.user.id)
      } else {
        setProfile(null)
      }
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [supabase.auth])

  const signOut = async () => {
    await supabase.auth.signOut()
    setProfile(null)
    window.location.href = '/login'
  }

  const setTheme = async (newTheme: Theme) => {
    // Apply immediately for instant feedback
    setThemeState(newTheme)
    applyTheme(newTheme)

    // Update in database if logged in
    if (user?.id) {
      try {
        await supabase
          .from('profiles')
          .update({ theme: newTheme })
          .eq('id', user.id)

        // Update local profile
        if (profile) {
          setProfile({ ...profile, theme: newTheme })
        }
      } catch (error) {
        console.error('Error updating theme:', error)
      }
    }
  }

  const isAdmin = profile?.role === 'administrador' || profile?.role === 'administrador_maestro'
  const isMasterAdmin = profile?.role === 'administrador_maestro'

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        loading,
        isAdmin,
        isMasterAdmin,
        theme,
        signOut,
        refreshProfile,
        setTheme,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

// =====================================================
// User/Auth Types
// =====================================================

export type UserRole = 'usuario' | 'administrador' | 'administrador_maestro'
export type Theme = 'light' | 'dark'

export interface UserProfile {
  id: string
  email: string
  name: string | null
  surname: string | null
  role: UserRole
  location: string | null
  is_active: boolean
  theme: Theme
  created_at: string
  updated_at: string
}

export interface CreateUserData {
  email: string
  name: string
  surname: string
  role: UserRole
  location?: string
  password: string
}

export interface UpdateUserData {
  name?: string
  surname?: string
  role?: UserRole
  location?: string
  is_active?: boolean
}

export interface User {
  id: string
  email: string
  name?: string
  surname?: string
  role?: UserRole
}

// =====================================================
// Chat Types
// =====================================================

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  references?: {
    page_number: number
    section: string | null
    similarity: number
  }[]
  timestamp: Date
}

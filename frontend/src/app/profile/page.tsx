'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Header from '@/components/Header'
import { useAuth } from '@/components/AuthProvider'
import { UpdateSelfProfileData, UserRole } from '@/types'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

const roleLabels: Record<UserRole, string> = {
  usuario: 'Usuario',
  administrador: 'Administrador',
  administrador_maestro: 'Administrador Maestro',
}

export default function ProfilePage() {
  const { profile, session, loading, refreshProfile } = useAuth()
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const [formData, setFormData] = useState<UpdateSelfProfileData>({
    name: '',
    surname: '',
    location: '',
  })

  useEffect(() => {
    if (!loading && !session) {
      router.push('/login')
    }
  }, [loading, session, router])

  useEffect(() => {
    if (profile) {
      setFormData({
        name: profile.name || '',
        surname: profile.surname || '',
        location: profile.location || '',
      })
    }
  }, [profile])

  const getAuthHeaders = (): Record<string, string> => {
    if (!session?.access_token) return {}
    return {
      Authorization: `Bearer ${session.access_token}`,
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setMessage(null)

    try {
      const response = await fetch(`${API_URL}/api/users/me`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify(formData),
      })

      if (response.ok) {
        await refreshProfile()
        setMessage({ type: 'success', text: 'Perfil actualizado correctamente' })
      } else {
        const error = await response.json()
        setMessage({ type: 'error', text: error.detail || 'Error actualizando perfil' })
      }
    } catch (error) {
      console.error('Error updating profile:', error)
      setMessage({ type: 'error', text: 'Error actualizando perfil' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 dark:bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (!profile) {
    return null
  }

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
      <Header />

      <main className="max-w-2xl mx-auto px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white mb-6">
            Mi Perfil
          </h1>

          {message && (
            <div
              className={`mb-4 p-3 rounded-lg ${
                message.type === 'success'
                  ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                  : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
              }`}
            >
              {message.text}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Email - Read Only */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Email
              </label>
              <input
                type="email"
                value={profile.email}
                disabled
                className="mt-1 w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                El email no puede ser modificado
              </p>
            </div>

            {/* Role - Read Only */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Rol
              </label>
              <input
                type="text"
                value={roleLabels[profile.role]}
                disabled
                className="mt-1 w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                El rol solo puede ser cambiado por un administrador
              </p>
            </div>

            {/* Name - Editable */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Nombre
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="mt-1 w-full px-4 py-3 min-h-[48px] border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Tu nombre"
              />
            </div>

            {/* Surname - Editable */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Apellido
              </label>
              <input
                type="text"
                value={formData.surname}
                onChange={(e) => setFormData({ ...formData, surname: e.target.value })}
                className="mt-1 w-full px-4 py-3 min-h-[48px] border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Tu apellido"
              />
            </div>

            {/* Location - Editable */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Ubicacion
              </label>
              <input
                type="text"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                className="mt-1 w-full px-4 py-3 min-h-[48px] border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Ej: Oficina Central, Hangar 3..."
              />
            </div>

            {/* Actions */}
            <div className="flex justify-between items-center pt-4 gap-4">
              <button
                type="button"
                onClick={() => router.push('/')}
                className="px-5 py-3 min-h-[48px] text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                Volver
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-6 py-3 min-h-[48px] bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                {saving ? 'Guardando...' : 'Guardar Cambios'}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  )
}

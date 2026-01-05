'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import AdminGuard from '@/components/AdminGuard'
import { useAuth } from '@/components/AuthProvider'
import { UserProfile, UserRole, CreateUserData, UpdateUserData } from '@/types'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

const roleLabels: Record<UserRole, string> = {
  usuario: 'Usuario',
  administrador: 'Administrador',
  administrador_maestro: 'Admin. Maestro',
}

const roleBadgeColors: Record<UserRole, string> = {
  usuario: 'bg-gray-100 text-gray-800',
  administrador: 'bg-blue-100 text-blue-800',
  administrador_maestro: 'bg-purple-100 text-purple-800',
}

export default function UsersPage() {
  const { profile, isMasterAdmin, session } = useAuth()
  const router = useRouter()
  const [users, setUsers] = useState<UserProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null)
  const [saving, setSaving] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  // Form state
  const [formData, setFormData] = useState<CreateUserData>({
    email: '',
    name: '',
    surname: '',
    role: 'usuario',
    location: '',
    password: '',
  })

  const [editFormData, setEditFormData] = useState<UpdateUserData>({
    name: '',
    surname: '',
    role: 'usuario',
    location: '',
    is_active: true,
  })

  const getAuthHeaders = (): Record<string, string> => {
    if (!session?.access_token) return {}
    return {
      Authorization: `Bearer ${session.access_token}`,
    }
  }

  useEffect(() => {
    if (session) {
      fetchUsers()
    }
  }, [session])

  const fetchUsers = async () => {
    try {
      const response = await fetch(`${API_URL}/api/users/`, {
        headers: getAuthHeaders(),
      })
      if (response.ok) {
        const data = await response.json()
        setUsers(data)
      }
    } catch (error) {
      console.error('Error fetching users:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)

    try {
      const response = await fetch(`${API_URL}/api/users/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify(formData),
      })

      if (response.ok) {
        await fetchUsers()
        setShowCreateModal(false)
        resetForm()
        alert('Usuario creado exitosamente. Se ha enviado un correo de bienvenida.')
      } else {
        const error = await response.json()
        alert(error.detail || 'Error creando usuario')
      }
    } catch (error) {
      console.error('Error creating user:', error)
      alert('Error creando usuario')
    } finally {
      setSaving(false)
    }
  }

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingUser) return
    setSaving(true)

    try {
      const response = await fetch(`${API_URL}/api/users/${editingUser.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify(editFormData),
      })

      if (response.ok) {
        await fetchUsers()
        setEditingUser(null)
      } else {
        const error = await response.json()
        alert(error.detail || 'Error actualizando usuario')
      }
    } catch (error) {
      console.error('Error updating user:', error)
      alert('Error actualizando usuario')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteUser = async (userId: string, userName: string) => {
    if (!confirm(`¿Estas seguro de eliminar a "${userName}"?`)) return

    try {
      const response = await fetch(`${API_URL}/api/users/${userId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      })

      if (response.ok) {
        await fetchUsers()
      } else {
        const error = await response.json()
        alert(error.detail || 'Error eliminando usuario')
      }
    } catch (error) {
      console.error('Error deleting user:', error)
    }
  }

  const handleDelegateMaster = async (userId: string, userName: string) => {
    if (!confirm(
      `¿Estas seguro de delegar el rol de Administrador Maestro a "${userName}"?\n\n` +
      `Tu rol sera cambiado a Administrador y perderas los privilegios de Administrador Maestro.`
    )) return

    setSaving(true)

    try {
      const response = await fetch(`${API_URL}/api/users/delegate-master/${userId}`, {
        method: 'POST',
        headers: getAuthHeaders(),
      })

      if (response.ok) {
        alert('Rol delegado exitosamente. Seras redirigido.')
        // Refresh the page to get updated roles
        window.location.reload()
      } else {
        const error = await response.json()
        alert(error.detail || 'Error delegando rol')
      }
    } catch (error) {
      console.error('Error delegating master:', error)
      alert('Error delegando rol')
    } finally {
      setSaving(false)
    }
  }

  const resetForm = () => {
    setFormData({
      email: '',
      name: '',
      surname: '',
      role: 'usuario',
      location: '',
      password: '',
    })
    setShowPassword(false)
  }

  const openEditModal = (user: UserProfile) => {
    setEditingUser(user)
    setEditFormData({
      name: user.name || '',
      surname: user.surname || '',
      role: user.role,
      location: user.location || '',
      is_active: user.is_active,
    })
  }

  const canManageUser = (targetRole: UserRole): boolean => {
    if (isMasterAdmin) return true
    // Admins can manage usuarios and other admins (but not master admin)
    return targetRole === 'usuario' || targetRole === 'administrador'
  }

  return (
    <AdminGuard>
      <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
        <Header />

        <main className="max-w-7xl mx-auto px-3 py-4 sm:px-4 sm:py-6 lg:px-8">
          {/* Tabs */}
          <div className="mb-4 sm:mb-6 border-b border-gray-200 dark:border-gray-700 overflow-x-auto">
            <nav className="-mb-px flex space-x-4 sm:space-x-8 min-w-max">
              <Link
                href="/admin"
                className="border-b-2 border-transparent py-2 px-1 text-xs sm:text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 whitespace-nowrap"
              >
                Manuales
              </Link>
              <Link
                href="/admin/users"
                className="border-b-2 border-blue-500 py-2 px-1 text-xs sm:text-sm font-medium text-blue-600 whitespace-nowrap"
              >
                Usuarios
              </Link>
              <Link
                href="/admin/settings"
                className="border-b-2 border-transparent py-2 px-1 text-xs sm:text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 whitespace-nowrap"
              >
                Configuracion
              </Link>
            </nav>
          </div>

          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6 sm:mb-8">
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">Gestion de Usuarios</h2>
              <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400">Administra los usuarios del sistema</p>
            </div>
            <button
              onClick={() => setShowCreateModal(true)}
              className="bg-blue-600 text-white px-3 sm:px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2 text-sm sm:text-base w-full sm:w-auto"
            >
              <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Nuevo Usuario
            </button>
          </div>

          {/* Users List */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
            {loading ? (
              <div className="p-6 sm:p-8 text-center">
                <div className="animate-spin rounded-full h-6 w-6 sm:h-8 sm:w-8 border-b-2 border-blue-600 mx-auto"></div>
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Cargando usuarios...</p>
              </div>
            ) : users.length === 0 ? (
              <div className="p-6 sm:p-8 text-center text-gray-500 dark:text-gray-400">
                No hay usuarios registrados
              </div>
            ) : (
              <>
                {/* Desktop Table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-900">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          Usuario
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          Rol
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          Ubicacion
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          Estado
                        </th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          Acciones
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                      {users.map((user) => (
                        <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div>
                              <div className="font-medium text-gray-900 dark:text-white">
                                {user.name} {user.surname}
                              </div>
                              <div className="text-sm text-gray-500 dark:text-gray-400">{user.email}</div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span
                              className={`px-2 py-1 text-xs rounded-full ${roleBadgeColors[user.role]}`}
                            >
                              {roleLabels[user.role]}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                            {user.location || '-'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span
                              className={`px-2 py-1 text-xs rounded-full ${
                                user.is_active
                                  ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                                  : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                              }`}
                            >
                              {user.is_active ? 'Activo' : 'Inactivo'}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                            {canManageUser(user.role) && user.id !== profile?.id && (
                              <div className="flex justify-end gap-3">
                                {isMasterAdmin && user.role === 'administrador' && user.is_active && (
                                  <button
                                    onClick={() =>
                                      handleDelegateMaster(user.id, `${user.name} ${user.surname}`)
                                    }
                                    className="text-purple-600 hover:text-purple-800 dark:text-purple-400 dark:hover:text-purple-300"
                                    disabled={saving}
                                  >
                                    Delegar
                                  </button>
                                )}
                                <button
                                  onClick={() => openEditModal(user)}
                                  className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                                >
                                  Editar
                                </button>
                                <button
                                  onClick={() =>
                                    handleDeleteUser(user.id, `${user.name} ${user.surname}`)
                                  }
                                  className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                                >
                                  Eliminar
                                </button>
                              </div>
                            )}
                            {user.id === profile?.id && (
                              <span className="text-gray-400 text-xs">(Tu cuenta)</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Cards */}
                <div className="md:hidden divide-y divide-gray-200 dark:divide-gray-700">
                  {users.map((user) => (
                    <div key={user.id} className="p-4">
                      <div className="flex justify-between items-start mb-2">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-sm text-gray-900 dark:text-white truncate">
                            {user.name} {user.surname}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{user.email}</p>
                        </div>
                        {user.id === profile?.id && (
                          <span className="text-gray-400 text-xs ml-2">(Tu)</span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2 mb-3">
                        <span className={`px-2 py-0.5 text-xs rounded-full ${roleBadgeColors[user.role]}`}>
                          {roleLabels[user.role]}
                        </span>
                        <span
                          className={`px-2 py-0.5 text-xs rounded-full ${
                            user.is_active
                              ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                              : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                          }`}
                        >
                          {user.is_active ? 'Activo' : 'Inactivo'}
                        </span>
                      </div>
                      {user.location && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">{user.location}</p>
                      )}
                      {canManageUser(user.role) && user.id !== profile?.id && (
                        <div className="flex gap-3 pt-2 border-t border-gray-100 dark:border-gray-700">
                          {isMasterAdmin && user.role === 'administrador' && user.is_active && (
                            <button
                              onClick={() =>
                                handleDelegateMaster(user.id, `${user.name} ${user.surname}`)
                              }
                              className="text-purple-600 hover:text-purple-800 dark:text-purple-400 text-xs"
                              disabled={saving}
                            >
                              Delegar
                            </button>
                          )}
                          <button
                            onClick={() => openEditModal(user)}
                            className="text-blue-600 hover:text-blue-800 dark:text-blue-400 text-xs"
                          >
                            Editar
                          </button>
                          <button
                            onClick={() =>
                              handleDeleteUser(user.id, `${user.name} ${user.surname}`)
                            }
                            className="text-red-600 hover:text-red-800 dark:text-red-400 text-xs"
                          >
                            Eliminar
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </main>

        {/* Create User Modal */}
        {showCreateModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg p-4 sm:p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
              <h3 className="text-base sm:text-lg font-semibold mb-4 text-gray-900 dark:text-white">Crear Nuevo Usuario</h3>
              <form onSubmit={handleCreateUser} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Nombre *</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Apellido *</label>
                  <input
                    type="text"
                    required
                    value={formData.surname}
                    onChange={(e) => setFormData({ ...formData, surname: e.target.value })}
                    className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Email *</label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Contrasena * (min. 8 caracteres)</label>
                  <div className="relative mt-1">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={8}
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-500 hover:text-gray-700"
                    >
                      {showPassword ? (
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                        </svg>
                      ) : (
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Rol *</label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value as UserRole })}
                    className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="usuario">Usuario</option>
                    <option value="administrador">Administrador</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Ubicacion</label>
                  <input
                    type="text"
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Ej: Oficina Central, Hangar 3..."
                  />
                </div>
                <div className="flex justify-end gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateModal(false)
                      resetForm()
                    }}
                    className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                    disabled={saving}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
                    disabled={saving}
                  >
                    {saving ? 'Creando...' : 'Crear Usuario'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Edit User Modal */}
        {editingUser && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg p-4 sm:p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
              <h3 className="text-base sm:text-lg font-semibold mb-4 text-gray-900 dark:text-white">
                Editar: {editingUser.name} {editingUser.surname}
              </h3>
              <form onSubmit={handleUpdateUser} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Nombre</label>
                  <input
                    type="text"
                    value={editFormData.name}
                    onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                    className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Apellido</label>
                  <input
                    type="text"
                    value={editFormData.surname}
                    onChange={(e) => setEditFormData({ ...editFormData, surname: e.target.value })}
                    className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Rol</label>
                  <select
                    value={editFormData.role}
                    onChange={(e) => setEditFormData({ ...editFormData, role: e.target.value as UserRole })}
                    className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    disabled={!isMasterAdmin && editingUser?.role !== 'usuario'}
                  >
                    <option value="usuario">Usuario</option>
                    <option value="administrador">Administrador</option>
                  </select>
                  {!isMasterAdmin && editingUser?.role !== 'usuario' && (
                    <p className="mt-1 text-xs text-gray-500">
                      Solo el Administrador Maestro puede cambiar roles de otros Administradores
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Ubicacion</label>
                  <input
                    type="text"
                    value={editFormData.location}
                    onChange={(e) => setEditFormData({ ...editFormData, location: e.target.value })}
                    className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="is_active"
                    checked={editFormData.is_active}
                    onChange={(e) =>
                      setEditFormData({ ...editFormData, is_active: e.target.checked })
                    }
                    className="h-4 w-4 text-blue-600 rounded"
                  />
                  <label htmlFor="is_active" className="text-sm text-gray-700">
                    Usuario activo
                  </label>
                </div>
                <div className="flex justify-end gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setEditingUser(null)}
                    className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                    disabled={saving}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
                    disabled={saving}
                  >
                    {saving ? 'Guardando...' : 'Guardar Cambios'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </AdminGuard>
  )
}

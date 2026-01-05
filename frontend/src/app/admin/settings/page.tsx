'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Header from '@/components/Header'
import AdminGuard from '@/components/AdminGuard'
import { useAuth } from '@/components/AuthProvider'
import { useSettings } from '@/contexts/SettingsContext'

const ANTHROPIC_MODELS = [
  {
    id: 'claude-3-5-haiku-20241022',
    name: 'Claude 3.5 Haiku',
    description: 'Mas rapido y economico. Ideal para tareas simples.'
  },
  {
    id: 'claude-sonnet-4-20250514',
    name: 'Claude Sonnet 4',
    description: 'Balance entre costo y calidad. Recomendado para uso general.'
  },
  {
    id: 'claude-opus-4-20250514',
    name: 'Claude Opus 4',
    description: 'Maxima calidad. Ideal para tareas complejas.'
  }
]

export default function SettingsPage() {
  const { isMasterAdmin } = useAuth()
  const { settings, loading, updateSetting } = useSettings()
  const [saving, setSaving] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)
  const [localUploadSize, setLocalUploadSize] = useState(settings.max_upload_size_mb)

  // Sync local state when settings load
  useEffect(() => {
    setLocalUploadSize(settings.max_upload_size_mb)
  }, [settings.max_upload_size_mb])

  const handleModelChange = async (modelId: string) => {
    if (!isMasterAdmin) return

    setSaving('model')
    setMessage(null)

    const success = await updateSetting('anthropic_model', modelId)

    if (success) {
      setMessage({ type: 'success', text: 'Modelo actualizado correctamente' })
    } else {
      setMessage({ type: 'error', text: 'Error al actualizar el modelo' })
    }

    setSaving(null)
    setTimeout(() => setMessage(null), 3000)
  }

  const handleUploadSizeCommit = async () => {
    if (!isMasterAdmin) return
    if (localUploadSize === settings.max_upload_size_mb) return

    setSaving('upload')
    setMessage(null)

    const success = await updateSetting('max_upload_size_mb', localUploadSize)

    if (success) {
      setMessage({ type: 'success', text: 'Limite de upload actualizado correctamente' })
    } else {
      setMessage({ type: 'error', text: 'Error al actualizar el limite' })
    }

    setSaving(null)
    setTimeout(() => setMessage(null), 3000)
  }

  const canEdit = isMasterAdmin

  return (
    <AdminGuard>
      <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
        <Header />

        <main className="max-w-4xl mx-auto px-3 py-4 sm:px-4 sm:py-6 lg:px-8">
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
                className="border-b-2 border-transparent py-2 px-1 text-xs sm:text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 whitespace-nowrap"
              >
                Usuarios
              </Link>
              <Link
                href="/admin/settings"
                className="border-b-2 border-blue-500 py-2 px-1 text-xs sm:text-sm font-medium text-blue-600 whitespace-nowrap"
              >
                Configuracion
              </Link>
            </nav>
          </div>

          {/* Header */}
          <div className="mb-6 sm:mb-8">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">Configuracion del Sistema</h2>
            <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400">Ajusta la configuracion global de la aplicacion</p>
            {!isMasterAdmin && (
              <div className="mt-2 px-3 py-2 bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                <p className="text-xs sm:text-sm text-yellow-700 dark:text-yellow-400">
                  Solo el Administrador Maestro puede modificar la configuracion. Modo de solo lectura.
                </p>
              </div>
            )}
          </div>

          {/* Message */}
          {message && (
            <div className={`mb-4 sm:mb-6 px-3 sm:px-4 py-2 sm:py-3 rounded-lg text-sm ${
              message.type === 'success'
                ? 'bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400'
                : 'bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400'
            }`}>
              {message.text}
            </div>
          )}

          {loading ? (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 sm:p-8 text-center">
              <div className="animate-spin rounded-full h-6 w-6 sm:h-8 sm:w-8 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Cargando configuracion...</p>
            </div>
          ) : (
            <div className="space-y-4 sm:space-y-6">
              {/* Modelo de IA */}
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
                <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200 dark:border-gray-700">
                  <h3 className="text-base sm:text-lg font-medium text-gray-900 dark:text-white">Modelo de IA</h3>
                  <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                    Selecciona el modelo de Anthropic que se usara para responder consultas
                  </p>
                </div>
                <div className="p-4 sm:p-6">
                  <div className="space-y-2 sm:space-y-3">
                    {ANTHROPIC_MODELS.map((model) => (
                      <label
                        key={model.id}
                        className={`flex items-start p-3 sm:p-4 border rounded-lg transition-colors ${
                          canEdit ? 'cursor-pointer' : 'cursor-not-allowed opacity-75'
                        } ${
                          settings.anthropic_model === model.id
                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
                            : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                        }`}
                      >
                        <input
                          type="radio"
                          name="model"
                          value={model.id}
                          checked={settings.anthropic_model === model.id}
                          onChange={() => handleModelChange(model.id)}
                          disabled={!canEdit || saving === 'model'}
                          className="mt-0.5 sm:mt-1 h-4 w-4 text-blue-600"
                        />
                        <div className="ml-2 sm:ml-3">
                          <span className="font-medium text-sm sm:text-base text-gray-900 dark:text-white">{model.name}</span>
                          <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">{model.description}</p>
                        </div>
                        {saving === 'model' && settings.anthropic_model === model.id && (
                          <div className="ml-auto">
                            <div className="animate-spin rounded-full h-4 w-4 sm:h-5 sm:w-5 border-b-2 border-blue-600"></div>
                          </div>
                        )}
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              {/* Limite de Upload */}
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
                <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200 dark:border-gray-700">
                  <h3 className="text-base sm:text-lg font-medium text-gray-900 dark:text-white">Limite de Subida</h3>
                  <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                    Tamano maximo permitido para archivos PDF (en MB)
                  </p>
                </div>
                <div className="p-4 sm:p-6">
                  <div className="flex items-center gap-3 sm:gap-4">
                    <input
                      type="range"
                      min="10"
                      max="200"
                      step="10"
                      value={localUploadSize}
                      onChange={(e) => setLocalUploadSize(parseInt(e.target.value))}
                      onMouseUp={handleUploadSizeCommit}
                      onTouchEnd={handleUploadSizeCommit}
                      disabled={!canEdit || saving === 'upload'}
                      className={`flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none ${
                        canEdit ? 'cursor-pointer' : 'cursor-not-allowed opacity-75'
                      }`}
                    />
                    <div className="w-16 sm:w-20 text-center">
                      <span className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
                        {localUploadSize}
                      </span>
                      <span className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 ml-1">MB</span>
                    </div>
                    {saving === 'upload' && (
                      <div className="animate-spin rounded-full h-4 w-4 sm:h-5 sm:w-5 border-b-2 border-blue-600"></div>
                    )}
                  </div>
                  <div className="mt-2 flex justify-between text-xs text-gray-500 dark:text-gray-400">
                    <span>10 MB</span>
                    <span>200 MB</span>
                  </div>
                </div>
              </div>

              {/* Info */}
              <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3 sm:p-4">
                <div className="flex">
                  <svg className="h-4 w-4 sm:h-5 sm:w-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div className="ml-2 sm:ml-3">
                    <p className="text-xs sm:text-sm text-blue-700 dark:text-blue-400">
                      Los cambios se aplican inmediatamente y afectan a todos los usuarios del sistema.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </AdminGuard>
  )
}

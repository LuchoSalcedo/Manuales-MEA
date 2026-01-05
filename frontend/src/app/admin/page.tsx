'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import AdminGuard from '@/components/AdminGuard'
import { useAuth } from '@/components/AuthProvider'
import { useProcessing } from '@/components/ProcessingProvider'
import { useSettings } from '@/contexts/SettingsContext'
import { Manual, getManuals } from '@/lib/api'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export default function AdminPage() {
  const { session, isMasterAdmin } = useAuth()
  const {
    activeJob,
    pausedJobs,
    startTracking,
    pauseJob,
    resumeJob,
    cancelJob,
    refreshPausedJobs,
    setOnJobComplete
  } = useProcessing()
  const { settings } = useSettings()

  const [manuals, setManuals] = useState<Manual[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [editingManual, setEditingManual] = useState<{ id: string; name: string } | null>(null)
  const [editName, setEditName] = useState('')
  const router = useRouter()

  const getAuthHeaders = (): Record<string, string> => {
    if (!session?.access_token) return {}
    return {
      Authorization: `Bearer ${session.access_token}`,
    }
  }

  const loadManuals = async () => {
    try {
      const data = await getManuals()
      setManuals(data)
    } catch (error) {
      console.error('Error loading manuals:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadManuals()
    // Configurar callback para recargar manuales cuando se complete un job
    setOnJobComplete(() => loadManuals)

    return () => {
      setOnJobComplete(undefined)
    }
  }, [setOnJobComplete])

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.name.endsWith('.pdf')) {
      alert('Solo se permiten archivos PDF')
      return
    }

    setUploading(true)

    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch(`${API_URL}/api/admin/upload`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: formData,
      })

      if (!response.ok) {
        throw new Error('Error al subir archivo')
      }

      const result = await response.json()

      // Usar el contexto global para tracking
      startTracking(result.job_id, file.name.replace('.pdf', ''))

    } catch (error) {
      console.error('Upload error:', error)
      alert('Error al subir el archivo')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const handlePauseJob = async (jobId: string) => {
    try {
      await pauseJob(jobId)
    } catch {
      alert('Error al pausar el procesamiento')
    }
  }

  const handleResumeJob = async (jobId: string) => {
    try {
      await resumeJob(jobId)
    } catch {
      alert('Error al reanudar el procesamiento')
    }
  }

  const handleCancelJob = async (jobId: string) => {
    if (!confirm('Cancelar procesamiento? Se perdera el progreso.')) {
      return
    }
    try {
      await cancelJob(jobId)
      await refreshPausedJobs()
    } catch {
      alert('Error al cancelar el procesamiento')
    }
  }

  const handleEditManual = (manual: Manual) => {
    setEditingManual({ id: manual.id, name: manual.name })
    setEditName(manual.name)
  }

  const handleSaveEdit = async () => {
    if (!editingManual) return

    try {
      const response = await fetch(`${API_URL}/api/admin/manuals/${editingManual.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ name: editName }),
      })

      if (!response.ok) {
        throw new Error('Error al actualizar')
      }

      await loadManuals()
      setEditingManual(null)
    } catch (error) {
      console.error('Edit error:', error)
      alert('Error al actualizar el nombre')
    }
  }

  const handleCancelEdit = () => {
    setEditingManual(null)
    setEditName('')
  }

  const handleDeleteManual = async (manualId: string, manualName: string) => {
    if (!confirm(`Eliminar "${manualName}"?`)) {
      return
    }

    try {
      const response = await fetch(`${API_URL}/api/admin/manuals/${manualId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      })

      if (!response.ok) {
        throw new Error('Error al eliminar manual')
      }

      await loadManuals()
    } catch (error) {
      console.error('Delete error:', error)
      alert('Error al eliminar el manual')
    }
  }

  // Mapear estado del job activo para la UI
  const processingJob = activeJob ? {
    jobId: activeJob.jobId,
    status: {
      status: activeJob.status,
      progress: activeJob.progress,
      total: activeJob.total,
      message: activeJob.message
    }
  } : null

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
                className="border-b-2 border-blue-500 py-2 px-1 text-xs sm:text-sm font-medium text-blue-600 whitespace-nowrap"
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
                className="border-b-2 border-transparent py-2 px-1 text-xs sm:text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 whitespace-nowrap"
              >
                Configuracion
              </Link>
            </nav>
          </div>

          {/* Header */}
          <div className="mb-6 sm:mb-8">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">Gestion de Manuales</h2>
            <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400">Sube y administra los manuales del sistema</p>
          </div>

          {/* Upload Section */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6 mb-4 sm:mb-6">
            <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white mb-3 sm:mb-4">Subir nuevo manual</h3>

            <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-6 sm:p-8 text-center">
              <input
                type="file"
                accept=".pdf"
                onChange={handleFileUpload}
                disabled={uploading || !!activeJob}
                className="hidden"
                id="file-upload"
              />
              <label
                htmlFor="file-upload"
                className={`cursor-pointer ${uploading || activeJob ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <svg
                  className="mx-auto h-10 w-10 sm:h-12 sm:w-12 text-gray-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                  />
                </svg>
                <p className="mt-2 text-xs sm:text-sm text-gray-600 dark:text-gray-400">
                  {uploading ? 'Subiendo...' : activeJob ? 'Procesando...' : 'Haz clic para seleccionar un PDF'}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-500">PDF hasta {settings.max_upload_size_mb}MB</p>
              </label>
            </div>

            {/* Processing status - shown inline when on admin page */}
            {processingJob && (
              <div className={`mt-3 sm:mt-4 p-3 sm:p-4 rounded-lg border ${
                processingJob.status.status === 'error' || processingJob.status.status === 'cancelled'
                  ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                  : processingJob.status.status === 'completed'
                  ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                  : processingJob.status.status === 'paused'
                  ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'
                  : 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
              }`}>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-0 mb-2">
                  <div className="flex items-center gap-2 sm:gap-3">
                    {!['completed', 'error', 'paused', 'cancelled'].includes(processingJob.status.status) && (
                      <div className="animate-spin rounded-full h-4 w-4 sm:h-5 sm:w-5 border-b-2 border-blue-600"></div>
                    )}
                    {processingJob.status.status === 'completed' && (
                      <svg className="w-4 h-4 sm:w-5 sm:h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                    {(processingJob.status.status === 'error' || processingJob.status.status === 'cancelled') && (
                      <svg className="w-4 h-4 sm:w-5 sm:h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    )}
                    {processingJob.status.status === 'paused' && (
                      <svg className="w-4 h-4 sm:w-5 sm:h-5 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    )}
                    <p className={`text-xs sm:text-sm font-medium ${
                      processingJob.status.status === 'error' || processingJob.status.status === 'cancelled'
                        ? 'text-red-700 dark:text-red-400'
                        : processingJob.status.status === 'completed'
                        ? 'text-green-700 dark:text-green-400'
                        : processingJob.status.status === 'paused'
                        ? 'text-yellow-700 dark:text-yellow-400'
                        : 'text-blue-700 dark:text-blue-400'
                    }`}>
                      {processingJob.status.message}
                    </p>
                  </div>

                  {/* Control buttons */}
                  {!['completed', 'error', 'cancelled'].includes(processingJob.status.status) && (
                    <div className="flex gap-2">
                      {processingJob.status.status === 'paused' ? (
                        <button
                          onClick={() => handleResumeJob(processingJob.jobId)}
                          className="px-2 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-1"
                        >
                          <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                          </svg>
                          <span className="hidden sm:inline">Reanudar</span>
                        </button>
                      ) : (
                        <button
                          onClick={() => handlePauseJob(processingJob.jobId)}
                          className="px-2 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 flex items-center gap-1"
                        >
                          <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                          </svg>
                          <span className="hidden sm:inline">Pausar</span>
                        </button>
                      )}
                      <button
                        onClick={() => handleCancelJob(processingJob.jobId)}
                        className="px-2 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center gap-1"
                      >
                        <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                        </svg>
                        <span className="hidden sm:inline">Cancelar</span>
                      </button>
                    </div>
                  )}
                </div>

                {processingJob.status.total > 0 && !['completed', 'cancelled'].includes(processingJob.status.status) && (
                  <div className="mt-2">
                    <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400 mb-1">
                      <span>Progreso</span>
                      <span>{processingJob.status.progress} / {processingJob.status.total}</span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all duration-300 ${
                          processingJob.status.status === 'paused' ? 'bg-yellow-500' : 'bg-blue-600'
                        }`}
                        style={{ width: `${(processingJob.status.progress / processingJob.status.total) * 100}%` }}
                      ></div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Paused Jobs Section */}
          {pausedJobs.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow mb-4 sm:mb-6">
              <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200 dark:border-gray-700">
                <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <svg className="w-4 h-4 sm:w-5 sm:h-5 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Procesamientos pausados ({pausedJobs.length})
                </h3>
              </div>
              <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                {pausedJobs.map((job) => (
                  <li key={job.id} className="px-4 sm:px-6 py-3 sm:py-4">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-sm sm:text-base text-gray-900 dark:text-white truncate">{job.manual_name}</h4>
                        <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                          Progreso: {job.current_page} / {job.total_pages} paginas
                          {job.paused_at && ` - Pausado: ${new Date(job.paused_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}`}
                        </p>
                        <div className="mt-1 w-full max-w-xs bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                          <div
                            className="bg-yellow-500 h-1.5 rounded-full"
                            style={{ width: `${job.total_pages > 0 ? (job.current_page / job.total_pages) * 100 : 0}%` }}
                          ></div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleResumeJob(job.id)}
                          className="px-2 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-1"
                        >
                          <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                          </svg>
                          <span className="hidden sm:inline">Reanudar</span>
                        </button>
                        <button
                          onClick={() => handleCancelJob(job.id)}
                          className="px-2 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center gap-1"
                        >
                          <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                          </svg>
                          <span className="hidden sm:inline">Cancelar</span>
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Manuals List */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
            <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white">
                Manuales ({manuals.length})
              </h3>
            </div>

            {loading ? (
              <div className="p-4 sm:p-6 text-center text-gray-500 dark:text-gray-400">Cargando...</div>
            ) : manuals.length === 0 ? (
              <div className="p-4 sm:p-6 text-center text-gray-500 dark:text-gray-400">
                No hay manuales procesados
              </div>
            ) : (
              <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                {manuals.map((manual) => (
                  <li key={manual.id} className="px-4 sm:px-6 py-3 sm:py-4">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-0">
                      <div className="flex-1 min-w-0">
                        {editingManual?.id === manual.id ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              className="flex-1 px-2 sm:px-3 py-1 sm:py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveEdit()
                                if (e.key === 'Escape') handleCancelEdit()
                              }}
                            />
                            <button
                              onClick={handleSaveEdit}
                              className="p-1 sm:p-1.5 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30 rounded"
                              title="Guardar"
                            >
                              <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                            </button>
                            <button
                              onClick={handleCancelEdit}
                              className="p-1 sm:p-1.5 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                              title="Cancelar"
                            >
                              <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        ) : (
                          <>
                            <h4 className="font-medium text-sm sm:text-base text-gray-900 dark:text-white truncate">{manual.name}</h4>
                            <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                              {manual.total_pages} paginas
                              {manual.created_at && ` - Cargado: ${new Date(manual.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}`}
                            </p>
                          </>
                        )}
                      </div>
                      <div className="flex items-center gap-2 sm:gap-3 sm:ml-4">
                        <span
                          className={`px-2 py-0.5 sm:py-1 text-xs rounded-full ${
                            manual.processed
                              ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                              : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
                          }`}
                        >
                          {manual.processed ? 'Procesado' : 'Pendiente'}
                        </span>
                        {!editingManual && (
                          <>
                            <button
                              onClick={() => handleEditManual(manual)}
                              className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 text-xs sm:text-sm"
                            >
                              Editar
                            </button>
                            <button
                              onClick={() => handleDeleteManual(manual.id, manual.name)}
                              className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 text-xs sm:text-sm"
                            >
                              Eliminar
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Back button */}
          <div className="mt-4 sm:mt-6">
            <button
              onClick={() => router.push('/')}
              className="text-sm sm:text-base text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
            >
              &larr; Volver al chat
            </button>
          </div>
        </main>
      </div>
    </AdminGuard>
  )
}

'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import AdminGuard from '@/components/AdminGuard'
import { useAuth } from '@/components/AuthProvider'
import { useProcessing } from '@/components/ProcessingProvider'
import { Manual, getManuals } from '@/lib/api'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export default function AdminPage() {
  const { session } = useAuth()
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
      <div className="min-h-screen bg-gray-100">
        <Header />

        <main className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
          {/* Tabs */}
          <div className="mb-6 border-b border-gray-200">
            <nav className="-mb-px flex space-x-8">
              <Link
                href="/admin"
                className="border-b-2 border-blue-500 py-2 px-1 text-sm font-medium text-blue-600"
              >
                Manuales
              </Link>
              <Link
                href="/admin/users"
                className="border-b-2 border-transparent py-2 px-1 text-sm font-medium text-gray-500 hover:text-gray-700 hover:border-gray-300"
              >
                Usuarios
              </Link>
            </nav>
          </div>

          {/* Header */}
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900">Gestion de Manuales</h2>
            <p className="text-gray-600">Sube y administra los manuales del sistema</p>
          </div>

          {/* Upload Section */}
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Subir nuevo manual</h3>

            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
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
                  className="mx-auto h-12 w-12 text-gray-400"
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
                <p className="mt-2 text-sm text-gray-600">
                  {uploading ? 'Subiendo...' : activeJob ? 'Procesando...' : 'Haz clic para seleccionar un PDF'}
                </p>
                <p className="text-xs text-gray-500">PDF hasta 50MB</p>
              </label>
            </div>

            {/* Processing status - shown inline when on admin page */}
            {processingJob && (
              <div className={`mt-4 p-4 rounded-lg border ${
                processingJob.status.status === 'error' || processingJob.status.status === 'cancelled'
                  ? 'bg-red-50 border-red-200'
                  : processingJob.status.status === 'completed'
                  ? 'bg-green-50 border-green-200'
                  : processingJob.status.status === 'paused'
                  ? 'bg-yellow-50 border-yellow-200'
                  : 'bg-blue-50 border-blue-200'
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    {!['completed', 'error', 'paused', 'cancelled'].includes(processingJob.status.status) && (
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                    )}
                    {processingJob.status.status === 'completed' && (
                      <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                    {(processingJob.status.status === 'error' || processingJob.status.status === 'cancelled') && (
                      <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    )}
                    {processingJob.status.status === 'paused' && (
                      <svg className="w-5 h-5 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    )}
                    <p className={`text-sm font-medium ${
                      processingJob.status.status === 'error' || processingJob.status.status === 'cancelled'
                        ? 'text-red-700'
                        : processingJob.status.status === 'completed'
                        ? 'text-green-700'
                        : processingJob.status.status === 'paused'
                        ? 'text-yellow-700'
                        : 'text-blue-700'
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
                          className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-1"
                        >
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                          </svg>
                          Reanudar
                        </button>
                      ) : (
                        <button
                          onClick={() => handlePauseJob(processingJob.jobId)}
                          className="px-3 py-1.5 text-sm bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 flex items-center gap-1"
                        >
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                          </svg>
                          Pausar
                        </button>
                      )}
                      <button
                        onClick={() => handleCancelJob(processingJob.jobId)}
                        className="px-3 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center gap-1"
                      >
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                        </svg>
                        Cancelar
                      </button>
                    </div>
                  )}
                </div>

                {processingJob.status.total > 0 && !['completed', 'cancelled'].includes(processingJob.status.status) && (
                  <div className="mt-2">
                    <div className="flex justify-between text-xs text-gray-600 mb-1">
                      <span>Progreso</span>
                      <span>{processingJob.status.progress} / {processingJob.status.total}</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
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
            <div className="bg-white rounded-lg shadow mb-6">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <svg className="w-5 h-5 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Procesamientos pausados ({pausedJobs.length})
                </h3>
              </div>
              <ul className="divide-y divide-gray-200">
                {pausedJobs.map((job) => (
                  <li key={job.id} className="px-6 py-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-gray-900">{job.manual_name}</h4>
                        <p className="text-sm text-gray-500">
                          Progreso: {job.current_page} / {job.total_pages} paginas
                          {job.paused_at && ` - Pausado: ${new Date(job.paused_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}`}
                        </p>
                        <div className="mt-1 w-full max-w-xs bg-gray-200 rounded-full h-1.5">
                          <div
                            className="bg-yellow-500 h-1.5 rounded-full"
                            style={{ width: `${job.total_pages > 0 ? (job.current_page / job.total_pages) * 100 : 0}%` }}
                          ></div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 ml-4">
                        <button
                          onClick={() => handleResumeJob(job.id)}
                          className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-1"
                        >
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                          </svg>
                          Reanudar
                        </button>
                        <button
                          onClick={() => handleCancelJob(job.id)}
                          className="px-3 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center gap-1"
                        >
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                          </svg>
                          Cancelar
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Manuals List */}
          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">
                Manuales ({manuals.length})
              </h3>
            </div>

            {loading ? (
              <div className="p-6 text-center text-gray-500">Cargando...</div>
            ) : manuals.length === 0 ? (
              <div className="p-6 text-center text-gray-500">
                No hay manuales procesados
              </div>
            ) : (
              <ul className="divide-y divide-gray-200">
                {manuals.map((manual) => (
                  <li key={manual.id} className="px-6 py-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        {editingManual?.id === manual.id ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveEdit()
                                if (e.key === 'Escape') handleCancelEdit()
                              }}
                            />
                            <button
                              onClick={handleSaveEdit}
                              className="p-1.5 text-green-600 hover:bg-green-50 rounded"
                              title="Guardar"
                            >
                              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                            </button>
                            <button
                              onClick={handleCancelEdit}
                              className="p-1.5 text-gray-600 hover:bg-gray-100 rounded"
                              title="Cancelar"
                            >
                              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        ) : (
                          <>
                            <h4 className="font-medium text-gray-900">{manual.name}</h4>
                            <p className="text-sm text-gray-500">
                              {manual.total_pages} paginas
                              {manual.created_at && ` - Cargado: ${new Date(manual.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`}
                            </p>
                          </>
                        )}
                      </div>
                      <div className="flex items-center gap-3 ml-4">
                        <span
                          className={`px-2 py-1 text-xs rounded-full ${
                            manual.processed
                              ? 'bg-green-100 text-green-800'
                              : 'bg-yellow-100 text-yellow-800'
                          }`}
                        >
                          {manual.processed ? 'Procesado' : 'Pendiente'}
                        </span>
                        {!editingManual && (
                          <>
                            <button
                              onClick={() => handleEditManual(manual)}
                              className="text-blue-600 hover:text-blue-800 text-sm"
                            >
                              Editar
                            </button>
                            <button
                              onClick={() => handleDeleteManual(manual.id, manual.name)}
                              className="text-red-600 hover:text-red-800 text-sm"
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
          <div className="mt-6">
            <button
              onClick={() => router.push('/')}
              className="text-blue-600 hover:text-blue-800"
            >
              &larr; Volver al chat
            </button>
          </div>
        </main>
      </div>
    </AdminGuard>
  )
}

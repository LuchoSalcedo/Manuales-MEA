'use client'

import { useRouter } from 'next/navigation'
import { useProcessing } from './ProcessingProvider'

export function ProcessingIndicator() {
  const router = useRouter()
  const { activeJob, pauseJob, cancelJob } = useProcessing()

  // No mostrar si no hay job activo o ya termino
  if (!activeJob || ['completed', 'cancelled', 'error'].includes(activeJob.status)) {
    return null
  }

  const isPaused = activeJob.status === 'paused'
  const progress = activeJob.total > 0
    ? Math.round((activeJob.progress / activeJob.total) * 100)
    : 0

  const handlePause = async (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await pauseJob(activeJob.jobId)
    } catch {
      alert('Error al pausar')
    }
  }

  const handleCancel = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('Cancelar procesamiento?')) return
    try {
      await cancelJob(activeJob.jobId)
    } catch {
      alert('Error al cancelar')
    }
  }

  const goToAdmin = () => {
    router.push('/admin')
  }

  return (
    <div
      onClick={goToAdmin}
      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg cursor-pointer transition-colors ${
        isPaused
          ? 'bg-yellow-50 border border-yellow-200 hover:bg-yellow-100'
          : 'bg-blue-50 border border-blue-200 hover:bg-blue-100'
      }`}
    >
      {/* Spinner o icono de pausa */}
      {isPaused ? (
        <svg className="w-4 h-4 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ) : (
        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
      )}

      {/* Mensaje */}
      <span className={`text-xs font-medium max-w-[150px] truncate ${
        isPaused ? 'text-yellow-700' : 'text-blue-700'
      }`}>
        {activeJob.manualName || activeJob.message}
      </span>

      {/* Progreso */}
      {activeJob.total > 0 && (
        <div className="flex items-center gap-1">
          <div className="w-16 bg-gray-200 rounded-full h-1.5">
            <div
              className={`h-1.5 rounded-full transition-all ${
                isPaused ? 'bg-yellow-500' : 'bg-blue-600'
              }`}
              style={{ width: `${progress}%` }}
            ></div>
          </div>
          <span className="text-xs text-gray-500">{progress}%</span>
        </div>
      )}

      {/* Botones de control */}
      <div className="flex gap-1 ml-1">
        {!isPaused && (
          <button
            onClick={handlePause}
            className="p-1 text-yellow-600 hover:bg-yellow-100 rounded"
            title="Pausar"
          >
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          </button>
        )}
        <button
          onClick={handleCancel}
          className="p-1 text-red-600 hover:bg-red-100 rounded"
          title="Cancelar"
        >
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
        </button>
      </div>
    </div>
  )
}

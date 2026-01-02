'use client'

import { createContext, useContext, useState, useEffect, useRef, useCallback, ReactNode } from 'react'
import { useAuth } from './AuthProvider'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export interface ProcessingJob {
  jobId: string
  status: 'queued' | 'detecting' | 'extracting' | 'ocr' | 'chunking' | 'embeddings' | 'saving' | 'paused' | 'completed' | 'cancelled' | 'error'
  progress: number
  total: number
  message: string
  manualName?: string
}

export interface PausedJob {
  id: string
  manual_name: string
  current_page: number
  total_pages: number
  paused_at: string
}

interface ProcessingContextType {
  activeJob: ProcessingJob | null
  pausedJobs: PausedJob[]
  startTracking: (jobId: string, manualName?: string) => void
  stopTracking: () => void
  pauseJob: (jobId: string) => Promise<void>
  resumeJob: (jobId: string) => Promise<void>
  cancelJob: (jobId: string) => Promise<void>
  refreshPausedJobs: () => Promise<void>
  onJobComplete?: () => void
  setOnJobComplete: (callback: (() => void) | undefined) => void
}

const ProcessingContext = createContext<ProcessingContextType | null>(null)

export function ProcessingProvider({ children }: { children: ReactNode }) {
  const { session, isAdmin } = useAuth()
  const [activeJob, setActiveJob] = useState<ProcessingJob | null>(null)
  const [pausedJobs, setPausedJobs] = useState<PausedJob[]>([])
  const pollingRef = useRef<NodeJS.Timeout | null>(null)
  const onJobCompleteRef = useRef<(() => void) | undefined>(undefined)

  const getAuthHeaders = useCallback((): Record<string, string> => {
    if (!session?.access_token) return {}
    return {
      Authorization: `Bearer ${session.access_token}`,
    }
  }, [session?.access_token])

  // Polling del estado del job activo
  const pollJobStatus = useCallback(async (jobId: string) => {
    try {
      const response = await fetch(`${API_URL}/api/admin/processing/${jobId}`, {
        headers: getAuthHeaders(),
      })
      if (!response.ok) return

      const status = await response.json()

      setActiveJob(prev => ({
        jobId,
        status: status.status,
        progress: status.progress,
        total: status.total,
        message: status.message,
        manualName: prev?.manualName
      }))

      // Si completado, error o cancelado, detener polling
      if (['completed', 'error', 'cancelled'].includes(status.status)) {
        if (pollingRef.current) {
          clearInterval(pollingRef.current)
          pollingRef.current = null
        }

        // Callback para recargar manuales
        if (status.status === 'completed' && onJobCompleteRef.current) {
          onJobCompleteRef.current()
        }

        // Limpiar despues de un momento
        setTimeout(() => {
          setActiveJob(null)
        }, 3000)
      }

      // Si pausado, detener polling y actualizar lista
      if (status.status === 'paused') {
        if (pollingRef.current) {
          clearInterval(pollingRef.current)
          pollingRef.current = null
        }
        await refreshPausedJobs()
      }
    } catch (error) {
      console.error('Error polling job status:', error)
    }
  }, [getAuthHeaders])

  // Cargar jobs pausados
  const refreshPausedJobs = useCallback(async () => {
    if (!isAdmin) return

    try {
      const response = await fetch(`${API_URL}/api/admin/processing/paused`, {
        headers: getAuthHeaders(),
      })
      if (response.ok) {
        const data = await response.json()
        setPausedJobs(data.jobs || [])
      }
    } catch (error) {
      console.error('Error loading paused jobs:', error)
    }
  }, [isAdmin, getAuthHeaders])

  // Verificar jobs activos al iniciar (para admins)
  useEffect(() => {
    if (isAdmin) {
      refreshPausedJobs()

      // Tambien verificar si hay jobs activos (no pausados)
      const checkActiveJobs = async () => {
        try {
          const response = await fetch(`${API_URL}/api/admin/processing/active`, {
            headers: getAuthHeaders(),
          })
          if (response.ok) {
            const data = await response.json()
            // Buscar un job que este procesando (no pausado, no completado)
            const processingJob = data.jobs?.find((job: { status: string }) =>
              !['paused', 'completed', 'cancelled', 'error'].includes(job.status)
            )
            if (processingJob) {
              startTracking(processingJob.id, processingJob.manual_name)
            }
          }
        } catch (error) {
          console.error('Error checking active jobs:', error)
        }
      }

      checkActiveJobs()
    }

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
      }
    }
  }, [isAdmin, getAuthHeaders, refreshPausedJobs])

  // Iniciar tracking de un job
  const startTracking = useCallback((jobId: string, manualName?: string) => {
    // Limpiar polling anterior
    if (pollingRef.current) {
      clearInterval(pollingRef.current)
    }

    setActiveJob({
      jobId,
      status: 'queued',
      progress: 0,
      total: 0,
      message: 'En cola...',
      manualName
    })

    // Iniciar polling
    pollingRef.current = setInterval(() => {
      pollJobStatus(jobId)
    }, 2000)

    // Primer poll inmediato
    pollJobStatus(jobId)
  }, [pollJobStatus])

  // Detener tracking
  const stopTracking = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current)
      pollingRef.current = null
    }
    setActiveJob(null)
  }, [])

  // Pausar job
  const pauseJob = useCallback(async (jobId: string) => {
    try {
      const response = await fetch(`${API_URL}/api/admin/processing/${jobId}/pause`, {
        method: 'POST',
        headers: getAuthHeaders(),
      })
      if (!response.ok) throw new Error('Error al pausar')
    } catch (error) {
      console.error('Pause error:', error)
      throw error
    }
  }, [getAuthHeaders])

  // Reanudar job
  const resumeJob = useCallback(async (jobId: string) => {
    try {
      const response = await fetch(`${API_URL}/api/admin/processing/${jobId}/resume`, {
        method: 'POST',
        headers: getAuthHeaders(),
      })
      if (!response.ok) throw new Error('Error al reanudar')

      // Iniciar tracking del job reanudado
      const pausedJob = pausedJobs.find(j => j.id === jobId)
      startTracking(jobId, pausedJob?.manual_name)

      // Actualizar lista de pausados
      await refreshPausedJobs()
    } catch (error) {
      console.error('Resume error:', error)
      throw error
    }
  }, [getAuthHeaders, pausedJobs, startTracking, refreshPausedJobs])

  // Cancelar job
  const cancelJob = useCallback(async (jobId: string) => {
    try {
      const response = await fetch(`${API_URL}/api/admin/processing/${jobId}/cancel`, {
        method: 'POST',
        headers: getAuthHeaders(),
      })
      if (!response.ok) throw new Error('Error al cancelar')

      // Si es el job activo, detener tracking
      if (activeJob?.jobId === jobId) {
        stopTracking()
      }

      // Actualizar lista de pausados
      await refreshPausedJobs()
    } catch (error) {
      console.error('Cancel error:', error)
      throw error
    }
  }, [getAuthHeaders, activeJob, stopTracking, refreshPausedJobs])

  // Setter para callback de completado
  const setOnJobComplete = useCallback((callback: (() => void) | undefined) => {
    onJobCompleteRef.current = callback
  }, [])

  return (
    <ProcessingContext.Provider value={{
      activeJob,
      pausedJobs,
      startTracking,
      stopTracking,
      pauseJob,
      resumeJob,
      cancelJob,
      refreshPausedJobs,
      setOnJobComplete
    }}>
      {children}
    </ProcessingContext.Provider>
  )
}

export function useProcessing() {
  const context = useContext(ProcessingContext)
  if (!context) {
    throw new Error('useProcessing must be used within ProcessingProvider')
  }
  return context
}

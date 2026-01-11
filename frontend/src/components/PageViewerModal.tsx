'use client'

import { useState, useEffect } from 'react'
import { useSettings } from '@/contexts/SettingsContext'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface PageViewerModalProps {
  isOpen: boolean
  onClose: () => void
  manualId: string
  pageNumber: number
  section?: string | null
}

export default function PageViewerModal({
  isOpen,
  onClose,
  manualId,
  pageNumber,
  section,
}: PageViewerModalProps) {
  const { settings } = useSettings()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isMobile, setIsMobile] = useState(false)
  const [zoom, setZoom] = useState(50)
  const [retryCount, setRetryCount] = useState(0)

  // Agregar timestamp para forzar recarga en retry
  const imageUrl = `${API_URL}/api/pages/${manualId}/${pageNumber}${retryCount > 0 ? `?retry=${retryCount}` : ''}`

  // Detect mobile on mount
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Set initial zoom based on device and settings
  useEffect(() => {
    if (isOpen) {
      setLoading(true)
      setError(null)
      setRetryCount(0)
      const defaultZoom = isMobile ? settings.page_zoom_mobile : settings.page_zoom_web
      setZoom(defaultZoom)
    }
  }, [isOpen, pageNumber, isMobile, settings.page_zoom_mobile, settings.page_zoom_web])

  if (!isOpen) return null

  const handleZoomIn = () => setZoom((z) => Math.min(z + 25, 200))
  const handleZoomOut = () => setZoom((z) => Math.max(z - 25, 25))

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="absolute inset-2 sm:inset-4 md:inset-8 lg:inset-12 bg-white dark:bg-gray-800 rounded-xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-3 sm:px-6 py-2 sm:py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
          <div className="min-w-0 flex-1">
            <h2 className="text-sm sm:text-lg font-semibold text-gray-900 dark:text-white truncate">
              Página {pageNumber}
            </h2>
            {section && (
              <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 truncate">{section}</p>
            )}
          </div>

          <div className="flex items-center gap-1 sm:gap-4 flex-shrink-0 ml-2">
            {/* Zoom controls */}
            <div className="flex items-center gap-1 sm:gap-2 bg-white dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600 px-1 sm:px-2 py-1">
              <button
                onClick={handleZoomOut}
                className="p-2 min-w-[40px] min-h-[40px] flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-600 rounded-lg"
                title="Reducir"
                aria-label="Reducir zoom"
              >
                <svg className="w-5 h-5 text-gray-600 dark:text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                </svg>
              </button>
              <span className="text-sm font-medium w-12 text-center text-gray-700 dark:text-gray-300">{zoom}%</span>
              <button
                onClick={handleZoomIn}
                className="p-2 min-w-[40px] min-h-[40px] flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-600 rounded-lg"
                title="Ampliar"
                aria-label="Ampliar zoom"
              >
                <svg className="w-5 h-5 text-gray-600 dark:text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </button>
            </div>

            {/* Open in new tab */}
            <a
              href={imageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
              title="Abrir en nueva pestaña"
              aria-label="Abrir en nueva pestaña"
            >
              <svg className="w-5 h-5 text-gray-600 dark:text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>

            {/* Close button */}
            <button
              onClick={onClose}
              className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
              title="Cerrar"
              aria-label="Cerrar modal"
            >
              <svg className="w-6 h-6 text-gray-600 dark:text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto bg-gray-100 dark:bg-gray-900 p-2 sm:p-4">
          <div className="flex justify-center min-h-full">
            {loading && (
              <div className="flex items-center justify-center py-10 sm:py-20">
                <div className="animate-spin rounded-full h-8 w-8 sm:h-12 sm:w-12 border-b-2 border-blue-600"></div>
              </div>
            )}

            {error && (
              <div className="flex items-center justify-center py-10 sm:py-20">
                <div className="text-center px-4">
                  <p className="text-red-600 mb-2 text-sm sm:text-base">{error}</p>
                  <button
                    onClick={() => {
                      setLoading(true)
                      setError(null)
                      setRetryCount(c => c + 1)
                    }}
                    className="text-blue-600 hover:underline text-sm sm:text-base"
                  >
                    Reintentar
                  </button>
                </div>
              </div>
            )}

            <img
              src={imageUrl}
              alt={`Página ${pageNumber}`}
              className="shadow-lg rounded-lg transition-transform duration-200 max-w-full"
              style={{
                transform: `scale(${zoom / 100})`,
                transformOrigin: 'top center',
                display: loading ? 'none' : 'block',
              }}
              onLoad={() => setLoading(false)}
              onError={() => {
                setLoading(false)
                setError('No se pudo cargar la página')
              }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

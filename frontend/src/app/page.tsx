'use client'

import { useState, useEffect } from 'react'
import { Manual, getManuals } from '@/lib/api'
import ManualSelector from '@/components/ManualSelector'
import Chat from '@/components/Chat'
import Header from '@/components/Header'
import { useChat } from '@/contexts/ChatContext'

export default function Home() {
  const [manuals, setManuals] = useState<Manual[]>([])
  const { selectedManual, setSelectedManual } = useChat()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadManuals() {
      try {
        const data = await getManuals()
        setManuals(data)
        setError(null)
      } catch (err) {
        setError('Error al cargar manuales. Verifica que el backend esté corriendo.')
      } finally {
        setLoading(false)
      }
    }

    loadManuals()
  }, [])

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
      <Header />

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-3 py-4 sm:px-4 sm:py-6 lg:px-8">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-gray-500">Cargando manuales...</div>
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-700">{error}</p>
            <p className="text-sm text-red-500 mt-2">
              Asegúrate de que el backend esté corriendo en http://localhost:8000
            </p>
          </div>
        ) : (
          <div className="flex flex-col lg:grid lg:grid-cols-4 gap-4 lg:gap-6">
            {/* Sidebar - Manual Selector */}
            <div className="lg:col-span-1">
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-3 sm:p-4">
                <ManualSelector
                  manuals={manuals}
                  selectedManual={selectedManual}
                  onSelect={setSelectedManual}
                />

                {manuals.length === 0 && (
                  <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
                    No hay manuales procesados. Usa el script generate_embeddings.py
                    para procesar un manual.
                  </p>
                )}
              </div>
            </div>

            {/* Main - Chat */}
            <div className="lg:col-span-3 flex-1">
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow h-[calc(100vh-180px)] sm:h-[calc(100vh-200px)] min-h-[400px] sm:min-h-[500px]">
                {selectedManual ? (
                  <Chat />
                ) : (
                  <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400 px-4">
                    <div className="text-center">
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
                          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                        />
                      </svg>
                      <p className="mt-2 text-sm sm:text-base">Selecciona un manual para comenzar</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

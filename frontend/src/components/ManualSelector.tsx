'use client'

import { useState, useRef, useEffect } from 'react'
import { Manual } from '@/lib/api'

interface ManualSelectorProps {
  manuals: Manual[]
  selectedManual: Manual | null
  onSelect: (manual: Manual) => void
}

export default function ManualSelector({
  manuals,
  selectedManual,
  onSelect,
}: ManualSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Cerrar dropdown al hacer clic fuera
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Cerrar con Escape
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setIsOpen(false)
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [])

  return (
    <div className="w-full">
      <label
        className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 sm:mb-2"
      >
        Seleccionar Manual
      </label>

      <div className="relative" ref={dropdownRef}>
        {/* Botón del dropdown */}
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="relative w-full px-3 sm:px-4 py-2 sm:py-3 text-left text-sm sm:text-base bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 cursor-pointer"
        >
          <span className={`block truncate ${selectedManual ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'}`}>
            {selectedManual?.name || '-- Selecciona un manual --'}
          </span>
          <span className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
            <svg
              className={`w-5 h-5 text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </span>
        </button>

        {/* Lista de opciones - siempre hacia abajo */}
        {isOpen && (
          <ul className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg max-h-[70vh] overflow-y-auto">
            {manuals.length === 0 ? (
              <li className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
                No hay manuales disponibles
              </li>
            ) : (
              manuals.map((manual) => (
                <li
                  key={manual.id}
                  onClick={() => {
                    onSelect(manual)
                    setIsOpen(false)
                  }}
                  className={`relative px-3 sm:px-4 py-2 sm:py-3 text-sm sm:text-base cursor-pointer select-none
                    ${selectedManual?.id === manual.id
                      ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                      : 'text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-600'
                    }`}
                >
                  <span className="block truncate pr-6">{manual.name}</span>
                  {selectedManual?.id === manual.id && (
                    <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-blue-600 dark:text-blue-400">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </span>
                  )}
                </li>
              ))
            )}
          </ul>
        )}
      </div>

      {selectedManual && (
        <p className="mt-1.5 sm:mt-2 text-xs sm:text-sm text-gray-500 dark:text-gray-400">
          {selectedManual.total_pages} páginas
          {selectedManual.description && ` - ${selectedManual.description}`}
        </p>
      )}
    </div>
  )
}

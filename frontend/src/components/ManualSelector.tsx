'use client'

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
  return (
    <div className="w-full">
      <label
        htmlFor="manual-select"
        className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 sm:mb-2"
      >
        Seleccionar Manual
      </label>
      <select
        id="manual-select"
        value={selectedManual?.id || ''}
        onChange={(e) => {
          const manual = manuals.find((m) => m.id === e.target.value)
          if (manual) onSelect(manual)
        }}
        className="block w-full px-3 sm:px-4 py-2 sm:py-3 text-sm sm:text-base bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 dark:text-white"
      >
        <option value="">-- Selecciona un manual --</option>
        {manuals.map((manual) => (
          <option key={manual.id} value={manual.id}>
            {manual.name}
          </option>
        ))}
      </select>
      {selectedManual && (
        <p className="mt-1.5 sm:mt-2 text-xs sm:text-sm text-gray-500 dark:text-gray-400">
          {selectedManual.total_pages} páginas
          {selectedManual.description && ` - ${selectedManual.description}`}
        </p>
      )}
    </div>
  )
}

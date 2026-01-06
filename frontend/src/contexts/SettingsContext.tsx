'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { useAuth } from '@/components/AuthProvider'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface AppSettings {
  anthropic_model: string
  max_upload_size_mb: number
  page_zoom_web: number
  page_zoom_mobile: number
  rag_allow_general_knowledge: boolean
}

interface SettingsContextType {
  settings: AppSettings
  loading: boolean
  updateSetting: (key: string, value: any) => Promise<boolean>
  refreshSettings: () => Promise<void>
}

const defaultSettings: AppSettings = {
  anthropic_model: 'claude-sonnet-4-20250514',
  max_upload_size_mb: 50,
  page_zoom_web: 50,
  page_zoom_mobile: 100,
  rag_allow_general_knowledge: true
}

const SettingsContext = createContext<SettingsContextType>({
  settings: defaultSettings,
  loading: true,
  updateSetting: async () => false,
  refreshSettings: async () => {}
})

export function SettingsProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const [settings, setSettings] = useState<AppSettings>(defaultSettings)
  const [loading, setLoading] = useState(true)

  const getAuthHeaders = (): Record<string, string> => {
    if (!session?.access_token) return {}
    return {
      Authorization: `Bearer ${session.access_token}`,
    }
  }

  const fetchSettings = async () => {
    if (!session?.access_token) {
      setLoading(false)
      return
    }

    try {
      const response = await fetch(`${API_URL}/api/settings/`, {
        headers: getAuthHeaders(),
      })

      if (response.ok) {
        const data = await response.json()
        const newSettings: AppSettings = { ...defaultSettings }

        for (const item of data) {
          if (item.key === 'anthropic_model') {
            newSettings.anthropic_model = item.value
          } else if (item.key === 'max_upload_size_mb') {
            newSettings.max_upload_size_mb = item.value
          } else if (item.key === 'page_zoom_web') {
            newSettings.page_zoom_web = item.value
          } else if (item.key === 'page_zoom_mobile') {
            newSettings.page_zoom_mobile = item.value
          } else if (item.key === 'rag_allow_general_knowledge') {
            newSettings.rag_allow_general_knowledge = item.value
          }
        }

        setSettings(newSettings)
      }
    } catch (error) {
      console.error('Error fetching settings:', error)
    } finally {
      setLoading(false)
    }
  }

  const updateSetting = async (key: string, value: any): Promise<boolean> => {
    try {
      const response = await fetch(`${API_URL}/api/settings/${key}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ value }),
      })

      if (response.ok) {
        await fetchSettings()
        return true
      } else {
        const error = await response.json()
        console.error('Error updating setting:', error)
        return false
      }
    } catch (error) {
      console.error('Error updating setting:', error)
      return false
    }
  }

  useEffect(() => {
    if (session) {
      fetchSettings()
    }
  }, [session])

  return (
    <SettingsContext.Provider
      value={{
        settings,
        loading,
        updateSetting,
        refreshSettings: fetchSettings,
      }}
    >
      {children}
    </SettingsContext.Provider>
  )
}

export function useSettings() {
  return useContext(SettingsContext)
}

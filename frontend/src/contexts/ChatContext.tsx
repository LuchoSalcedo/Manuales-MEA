'use client'

import { createContext, useContext, useState, useCallback, ReactNode } from 'react'
import { Message } from '@/types'
import { Manual } from '@/lib/api'

interface ChatContextType {
  selectedManual: Manual | null
  messages: Message[]
  setSelectedManual: (manual: Manual | null) => void
  addMessage: (message: Message) => void
  clearChat: () => void
  clearAllChats: () => void
}

const ChatContext = createContext<ChatContextType | undefined>(undefined)

export function ChatProvider({ children }: { children: ReactNode }) {
  const [selectedManual, setSelectedManualState] = useState<Manual | null>(null)
  const [messagesByManual, setMessagesByManual] = useState<Record<string, Message[]>>({})

  // Obtener mensajes del manual actual
  const messages = selectedManual
    ? messagesByManual[selectedManual.id] || []
    : []

  // Cambiar manual seleccionado
  const setSelectedManual = useCallback((manual: Manual | null) => {
    setSelectedManualState(manual)
  }, [])

  // Agregar mensaje al manual actual
  const addMessage = useCallback((message: Message) => {
    if (!selectedManual) return

    setMessagesByManual(prev => ({
      ...prev,
      [selectedManual.id]: [...(prev[selectedManual.id] || []), message]
    }))
  }, [selectedManual])

  // Limpiar chat del manual actual
  const clearChat = useCallback(() => {
    if (!selectedManual) return

    setMessagesByManual(prev => ({
      ...prev,
      [selectedManual.id]: []
    }))
  }, [selectedManual])

  // Limpiar todos los chats
  const clearAllChats = useCallback(() => {
    setMessagesByManual({})
    setSelectedManualState(null)
  }, [])

  return (
    <ChatContext.Provider
      value={{
        selectedManual,
        messages,
        setSelectedManual,
        addMessage,
        clearChat,
        clearAllChats,
      }}
    >
      {children}
    </ChatContext.Provider>
  )
}

export function useChat() {
  const context = useContext(ChatContext)
  if (!context) {
    throw new Error('useChat must be used within a ChatProvider')
  }
  return context
}

'use client'

import { useState, useRef, useEffect } from 'react'
import { Message } from '@/types'
import { sendMessage } from '@/lib/api'
import ChatMessage from './ChatMessage'
import ChatInput from './ChatInput'
import { useChat } from '@/contexts/ChatContext'

export default function Chat() {
  const { selectedManual, messages, addMessage, clearChat } = useChat()
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // Guard: si no hay manual seleccionado, no renderizar
  if (!selectedManual) {
    return null
  }

  const handleSend = async (content: string) => {
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content,
      timestamp: new Date(),
    }

    addMessage(userMessage)
    setIsLoading(true)

    try {
      const response = await sendMessage(content, selectedManual.id)

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response.answer,
        references: response.references.map((ref) => ({
          page_number: ref.page_number,
          section: ref.section,
          similarity: ref.similarity,
        })),
        timestamp: new Date(),
        source_type: response.source_type,
      }

      addMessage(assistantMessage)
    } catch (error) {
      console.error('Chat error:', error)
      const errorText = error instanceof Error ? error.message : 'Error desconocido'
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `Error al procesar tu pregunta: ${errorText}. Por favor intenta de nuevo.`,
        timestamp: new Date(),
      }
      addMessage(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-blue-600 text-white px-3 sm:px-4 py-2 sm:py-3 rounded-t-lg flex justify-between items-center">
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-sm sm:text-base truncate">{selectedManual.name}</h2>
          <p className="text-xs sm:text-sm opacity-75">{selectedManual.total_pages} páginas</p>
        </div>
        {messages.length > 0 && (
          <button
            onClick={() => {
              if (confirm('¿Borrar la conversación de este manual?')) {
                clearChat()
              }
            }}
            className="p-1.5 sm:p-2 hover:bg-blue-700 rounded-lg transition-colors flex-shrink-0 ml-2"
            title="Borrar conversación"
          >
            <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3 sm:space-y-4 bg-white dark:bg-gray-800">
        {messages.length === 0 ? (
          <div className="text-center text-gray-500 dark:text-gray-400 mt-6 sm:mt-8 px-4">
            <p className="text-base sm:text-lg mb-2">Bienvenido al asistente de manuales</p>
            <p className="text-xs sm:text-sm">
              Haz una pregunta sobre el manual seleccionado
            </p>
          </div>
        ) : (
          messages.map((message) => (
            <ChatMessage key={message.id} message={message} manualId={selectedManual.id} />
          ))
        )}

        {isLoading && (
          <div className="flex justify-start mb-4">
            <div className="bg-gray-100 dark:bg-gray-700 rounded-lg px-3 sm:px-4 py-2 sm:py-3">
              <div className="flex space-x-2">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                <div
                  className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                  style={{ animationDelay: '0.1s' }}
                />
                <div
                  className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                  style={{ animationDelay: '0.2s' }}
                />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-3 sm:p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 rounded-b-lg">
        <ChatInput
          onSend={handleSend}
          disabled={isLoading}
          placeholder="Escribe tu pregunta..."
        />
      </div>
    </div>
  )
}

'use client'

import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { Message } from '@/types'
import PageViewerModal from './PageViewerModal'

interface ChatMessageProps {
  message: Message
  manualId?: string
}

export default function ChatMessage({ message, manualId }: ChatMessageProps) {
  const isUser = message.role === 'user'
  const [selectedPage, setSelectedPage] = useState<{
    pageNumber: number
    section: string | null
  } | null>(null)

  return (
    <>
      <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3 sm:mb-4`}>
        <div
          className={`max-w-[90%] sm:max-w-[85%] rounded-lg ${
            isUser
              ? 'bg-blue-600 text-white px-3 sm:px-4 py-2 sm:py-3'
              : 'bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 shadow-sm'
          }`}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap text-sm sm:text-base">{message.content}</p>
          ) : (
            <div className="p-3 sm:p-4">
              {/* Contenido con Markdown */}
              <div className="markdown-content">
                <ReactMarkdown
                  components={{
                    h1: ({ children }) => (
                      <h1 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white mt-3 mb-1 first:mt-0">{children}</h1>
                    ),
                    h2: ({ children }) => (
                      <h2 className="text-sm sm:text-base font-bold text-gray-900 dark:text-white mt-3 mb-1">{children}</h2>
                    ),
                    h3: ({ children }) => (
                      <h3 className="text-xs sm:text-sm font-semibold text-gray-900 dark:text-white mt-2 mb-0.5">{children}</h3>
                    ),
                    p: ({ children }) => (
                      <p className="text-gray-700 dark:text-gray-300 mb-1.5 leading-snug text-xs sm:text-sm">{children}</p>
                    ),
                    strong: ({ children }) => (
                      <strong className="font-semibold text-gray-900 dark:text-white">{children}</strong>
                    ),
                    em: ({ children }) => (
                      <em className="italic text-gray-700 dark:text-gray-300">{children}</em>
                    ),
                    ul: ({ children }) => (
                      <ul className="list-disc ml-4 mb-1.5 space-y-0.5 text-gray-700 dark:text-gray-300 text-xs sm:text-sm">{children}</ul>
                    ),
                    ol: ({ children }) => (
                      <ol className="list-decimal ml-4 mb-1.5 space-y-0.5 text-gray-700 dark:text-gray-300 text-xs sm:text-sm">{children}</ol>
                    ),
                    li: ({ children }) => (
                      <li className="leading-snug">{children}</li>
                    ),
                    code: ({ children, className }) => {
                      const isBlock = className?.includes('language-')
                      if (isBlock) {
                        return (
                          <code className="block bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 p-2 rounded-lg text-xs font-mono overflow-x-auto">
                            {children}
                          </code>
                        )
                      }
                      return (
                        <code className="bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 px-1 py-0.5 rounded text-xs font-mono">
                          {children}
                        </code>
                      )
                    },
                    pre: ({ children }) => (
                      <pre className="mb-1.5">{children}</pre>
                    ),
                    blockquote: ({ children }) => (
                      <blockquote className="border-l-3 border-blue-500 pl-3 py-0.5 my-1.5 bg-blue-50 dark:bg-blue-900/30 rounded-r text-xs sm:text-sm">
                        {children}
                      </blockquote>
                    ),
                    hr: () => <hr className="my-2 border-gray-200 dark:border-gray-600" />,
                  }}
                >
                  {message.content}
                </ReactMarkdown>
              </div>

              {/* Referencias */}
              {message.references && message.references.length > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-600">
                  <div className="flex items-center gap-1.5 mb-2">
                    <svg className="w-3.5 h-3.5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                    </svg>
                    <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">
                      Referencias del manual
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    {message.references.map((ref, idx) => (
                      <button
                        key={idx}
                        onClick={() => manualId && setSelectedPage({
                          pageNumber: ref.page_number,
                          section: ref.section,
                        })}
                        className="w-full text-left flex items-center gap-2 px-2 sm:px-2.5 py-1.5 rounded-md bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/30 dark:to-indigo-900/30 border border-blue-100 dark:border-blue-800 hover:border-blue-300 dark:hover:border-blue-600 hover:shadow-sm transition-all group"
                      >
                        {/* Número de página */}
                        <span className="flex-shrink-0 flex items-center justify-center w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-blue-600 text-white text-xs font-bold group-hover:bg-blue-700 transition-colors">
                          {ref.page_number}
                        </span>

                        {/* Contenido */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs sm:text-sm font-medium text-gray-900 dark:text-white">
                              Página {ref.page_number}
                            </span>
                            {manualId && (
                              <span className="text-blue-600 text-xs flex items-center gap-0.5 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                                <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                </svg>
                                <span className="hidden sm:inline">Ver</span>
                              </span>
                            )}
                          </div>
                          {ref.section && (
                            <p className="text-xs text-gray-500 dark:text-gray-400 leading-tight truncate">
                              {ref.section}
                            </p>
                          )}
                        </div>

                        {/* Flecha */}
                        <svg className="w-4 h-4 text-gray-400 group-hover:text-blue-600 transition-colors flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Modal para ver página */}
      {manualId && selectedPage && (
        <PageViewerModal
          isOpen={!!selectedPage}
          onClose={() => setSelectedPage(null)}
          manualId={manualId}
          pageNumber={selectedPage.pageNumber}
          section={selectedPage.section}
        />
      )}
    </>
  )
}

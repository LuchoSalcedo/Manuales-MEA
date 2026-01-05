'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useAuth } from './AuthProvider'
import { ProcessingIndicator } from './ProcessingIndicator'
import { UserRole } from '@/types'

const roleLabels: Record<UserRole, string> = {
  usuario: 'Usuario',
  administrador: 'Administrador',
  administrador_maestro: 'Admin. Maestro',
}

const roleBadgeColors: Record<UserRole, string> = {
  usuario: 'bg-gray-100 text-gray-700',
  administrador: 'bg-blue-100 text-blue-700',
  administrador_maestro: 'bg-purple-100 text-purple-700',
}

export default function Header() {
  const { user, profile, signOut, loading, isAdmin, theme, setTheme } = useAuth()
  const pathname = usePathname()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const displayName = profile
    ? `${profile.name || ''} ${profile.surname || ''}`.trim() || profile.email
    : user?.email

  return (
    <header className="bg-white dark:bg-gray-800 shadow relative">
      <div className="max-w-7xl mx-auto px-4 py-3 sm:py-4 sm:px-6 lg:px-8">
        {/* Desktop & Mobile Header */}
        <div className="flex justify-between items-center">
          {/* Logo and Title */}
          <div className="flex items-center gap-2 md:gap-4 lg:gap-8">
            <Link href="/" className="flex items-center gap-2 md:gap-4 hover:opacity-80 transition-opacity">
              <Image
                src="/Logo_MEAv2.png"
                alt="Logo MEA"
                width={140}
                height={60}
                className="object-contain w-20 h-10 sm:w-28 sm:h-12 md:w-[140px] md:h-[60px]"
              />
              <div className="hidden sm:block">
                <span className="text-lg md:text-2xl font-bold text-gray-900 dark:text-white">
                  Manuales MEA
                </span>
                <p className="text-xs md:text-sm text-gray-500 dark:text-gray-400 hidden md:block">
                  Sistema de consulta de manuales tecnicos
                </p>
              </div>
            </Link>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex gap-4">
              <Link
                href="/"
                className={`text-sm font-medium ${
                  pathname === '/' ? 'text-blue-600' : 'text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white'
                }`}
              >
                Chat
              </Link>
              {isAdmin && (
                <Link
                  href="/admin"
                  className={`text-sm font-medium ${
                    pathname.startsWith('/admin') ? 'text-blue-600' : 'text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white'
                  }`}
                >
                  Admin
                </Link>
              )}
            </nav>
          </div>

          {/* Desktop Right Side */}
          <div className="hidden md:flex items-center gap-4">
            {/* Indicador global de procesamiento */}
            {isAdmin && <ProcessingIndicator />}

            {!loading && user && (
              <>
                {/* Theme Toggle */}
                <button
                  onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
                  className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
                  title={theme === 'light' ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro'}
                >
                  {theme === 'light' ? (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                    </svg>
                  )}
                </button>
                <Link href="/profile" className="text-right hover:opacity-80 transition-opacity">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 hover:text-blue-600 dark:hover:text-blue-400">{displayName}</p>
                  {profile && (
                    <span
                      className={`inline-block px-2 py-0.5 text-xs rounded-full ${
                        roleBadgeColors[profile.role]
                      }`}
                    >
                      {roleLabels[profile.role]}
                    </span>
                  )}
                </Link>
                <button
                  onClick={signOut}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600 transition-colors"
                >
                  Cerrar sesion
                </button>
              </>
            )}
          </div>

          {/* Mobile Menu Button */}
          <div className="flex md:hidden items-center gap-2">
            {/* Theme Toggle Mobile */}
            {!loading && user && (
              <button
                onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
                className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
              >
                {theme === 'light' ? (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                )}
              </button>
            )}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              {mobileMenuOpen ? (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden mt-4 pb-4 border-t border-gray-200 dark:border-gray-700 pt-4">
            <nav className="flex flex-col gap-3">
              <Link
                href="/"
                onClick={() => setMobileMenuOpen(false)}
                className={`text-base font-medium px-3 py-2 rounded-lg ${
                  pathname === '/'
                    ? 'text-blue-600 bg-blue-50 dark:bg-blue-900/20'
                    : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
                }`}
              >
                Chat
              </Link>
              {isAdmin && (
                <Link
                  href="/admin"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`text-base font-medium px-3 py-2 rounded-lg ${
                    pathname.startsWith('/admin')
                      ? 'text-blue-600 bg-blue-50 dark:bg-blue-900/20'
                      : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
                  }`}
                >
                  Admin
                </Link>
              )}
            </nav>

            {!loading && user && (
              <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                <Link
                  href="/profile"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{displayName}</p>
                    {profile && (
                      <span
                        className={`inline-block px-2 py-0.5 text-xs rounded-full mt-1 ${
                          roleBadgeColors[profile.role]
                        }`}
                      >
                        {roleLabels[profile.role]}
                      </span>
                    )}
                  </div>
                  <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
                <button
                  onClick={() => {
                    setMobileMenuOpen(false)
                    signOut()
                  }}
                  className="w-full mt-3 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600 transition-colors text-center"
                >
                  Cerrar sesion
                </button>
              </div>
            )}

            {/* Mobile Processing Indicator */}
            {isAdmin && (
              <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                <ProcessingIndicator />
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  )
}

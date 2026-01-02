'use client'

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
  const { user, profile, signOut, loading, isAdmin } = useAuth()
  const pathname = usePathname()

  const displayName = profile
    ? `${profile.name || ''} ${profile.surname || ''}`.trim() || profile.email
    : user?.email

  return (
    <header className="bg-white shadow">
      <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8 flex justify-between items-center">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <Image
              src="/Logo_MEA.png"
              alt="Logo MEA"
              width={48}
              height={48}
              className="object-contain"
            />
            <div>
              <span className="text-2xl font-bold text-gray-900">
                Manuales MEA
              </span>
              <p className="text-sm text-gray-500">
                Sistema de consulta de manuales tecnicos
              </p>
            </div>
          </Link>
          <nav className="flex gap-4">
            <Link
              href="/"
              className={`text-sm font-medium ${
                pathname === '/' ? 'text-blue-600' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Chat
            </Link>
            {isAdmin && (
              <Link
                href="/admin"
                className={`text-sm font-medium ${
                  pathname.startsWith('/admin') ? 'text-blue-600' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Admin
              </Link>
            )}
          </nav>
        </div>

        {/* Indicador global de procesamiento */}
        {isAdmin && <ProcessingIndicator />}

        <div className="flex items-center gap-4">
          {!loading && user && (
            <>
              <div className="text-right">
                <p className="text-sm font-medium text-gray-900">{displayName}</p>
                {profile && (
                  <span
                    className={`inline-block px-2 py-0.5 text-xs rounded-full ${
                      roleBadgeColors[profile.role]
                    }`}
                  >
                    {roleLabels[profile.role]}
                  </span>
                )}
              </div>
              <button
                onClick={signOut}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Cerrar sesion
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  )
}

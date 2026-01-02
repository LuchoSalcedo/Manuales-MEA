'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from './AuthProvider'

interface AdminGuardProps {
  children: React.ReactNode
  requireMaster?: boolean
}

export default function AdminGuard({ children, requireMaster = false }: AdminGuardProps) {
  const { loading, isAdmin, isMasterAdmin, profile } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && profile) {
      if (requireMaster && !isMasterAdmin) {
        router.push('/')
      } else if (!requireMaster && !isAdmin) {
        router.push('/')
      }
    }
  }, [loading, isAdmin, isMasterAdmin, requireMaster, router, profile])

  // Show loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Cargando...</p>
        </div>
      </div>
    )
  }

  // Redirect if not authorized
  if (requireMaster && !isMasterAdmin) {
    return null
  }

  if (!requireMaster && !isAdmin) {
    return null
  }

  return <>{children}</>
}

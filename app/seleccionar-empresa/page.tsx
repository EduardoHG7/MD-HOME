'use client'

import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import Image from 'next/image'
import type { TenantInfo } from '@/types/next-auth'

export default function SeleccionarEmpresaPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [selecting, setSelecting] = useState<string | null>(null)

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login')
  }, [status, router])

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-400 text-sm">Cargando...</div>
      </div>
    )
  }

  if (!session) return null

  const tenants: TenantInfo[] = session.user.availableTenants ?? []

  if (tenants.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="max-w-md w-full text-center">
          <div className="text-5xl mb-4">🏢</div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Sin acceso asignado</h1>
          <p className="text-gray-500 mb-6">
            No tienes acceso a ninguna empresa. Contacta al administrador para que te asigne acceso.
          </p>
          <p className="text-sm text-gray-400 mb-6">
            Administrador: <a href="mailto:eduardo.r.guzman@live.com" className="text-blue-600 hover:underline">eduardo.r.guzman@live.com</a>
          </p>
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-100 transition-all"
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    )
  }

  async function selectTenant(tenant: TenantInfo) {
    setSelecting(tenant.id)
    await fetch('/api/tenants/seleccionar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenantId: tenant.id }),
    })
    // Full page reload to clear all cached data from previous tenant
    const role = tenant.role
    const dest = (role === 'ADMIN' || session?.user.isSuperAdmin)
      ? '/admin'
      : role === 'CONTABILIDAD'
        ? '/contabilidad'
        : '/usuario'
    window.location.href = dest
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="max-w-lg w-full">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Selecciona una empresa</h1>
          <p className="text-gray-500 mt-1 text-sm">Hola, {session.user.name}. ¿A qué empresa vas a ingresar?</p>
        </div>

        <div className="space-y-3">
          {tenants.map(tenant => (
            <button
              key={tenant.id}
              onClick={() => selectTenant(tenant)}
              disabled={!!selecting}
              className="w-full flex items-center gap-4 bg-white border-2 border-gray-200 hover:border-gray-400 rounded-2xl px-5 py-4 transition-all text-left disabled:opacity-60"
            >
              <div className="w-12 h-12 rounded-xl overflow-hidden bg-gray-100 shrink-0 flex items-center justify-center">
                {tenant.logo ? (
                  <Image src={tenant.logo} alt={tenant.nombre} width={48} height={48} className="object-contain" />
                ) : (
                  <span className="text-2xl">🏢</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900">{tenant.nombre}</p>
                <p className="text-xs text-gray-400 mt-0.5 capitalize">{tenant.role.toLowerCase()}</p>
              </div>
              {selecting === tenant.id ? (
                <span className="text-gray-400 text-sm">Entrando...</span>
              ) : (
                <span className="text-gray-300 text-lg">→</span>
              )}
            </button>
          ))}
        </div>

        <div className="mt-6 text-center">
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="text-sm text-gray-400 hover:text-gray-600 transition-all"
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    </div>
  )
}

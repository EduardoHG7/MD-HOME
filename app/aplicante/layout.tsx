'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { usePathname, useRouter } from 'next/navigation'

// Rutas públicas de /aplicante donde no aplica el chequeo de "debe cambiar
// contraseña" (no hay sesión todavía, o es la página que resuelve eso).
const RUTAS_EXENTAS = ['/aplicante/login', '/aplicante/registro', '/aplicante/cambiar-password']

export default function AplicanteLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession()
  const pathname = usePathname()
  const router = useRouter()
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    if (status !== 'authenticated' || session?.user?.role !== 'APLICANTE') { setChecked(true); return }
    if (RUTAS_EXENTAS.some(r => pathname?.startsWith(r))) { setChecked(true); return }

    fetch(`/api/aplicantes/${session.user.id}`)
      .then(r => r.json())
      .then(data => {
        if (data?.debeCambiarPassword) {
          router.replace('/aplicante/cambiar-password')
        } else {
          setChecked(true)
        }
      })
      .catch(() => setChecked(true))
  }, [status, session, pathname, router])

  if (status === 'authenticated' && session?.user?.role === 'APLICANTE' &&
      !RUTAS_EXENTAS.some(r => pathname?.startsWith(r)) && !checked) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-400 animate-pulse text-sm">Cargando...</div>
      </div>
    )
  }

  return <>{children}</>
}

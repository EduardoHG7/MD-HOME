'use client'

import { useState } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'

export default function CambiarPasswordPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres')
      return
    }
    if (password !== confirmar) {
      setError('Las contraseñas no coinciden')
      return
    }

    setLoading(true)
    const res = await fetch('/api/aplicantes/cambiar-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    setLoading(false)

    if (res.ok) {
      router.push('/aplicante/perfil')
    } else {
      const data = await res.json().catch(() => ({}))
      setError(data.error || 'No se pudo cambiar la contraseña')
    }
  }

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-400 animate-pulse text-sm">Cargando...</div>
      </div>
    )
  }

  if (status === 'unauthenticated' || session?.user?.role !== 'APLICANTE') {
    router.replace('/aplicante/login')
    return null
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <Image src="/logo.png" alt="Magic Dreams Productions" width={160} height={80} className="mx-auto object-contain" priority />
        </div>

        <div className="card p-7">
          <h1 className="text-xl font-bold text-gray-900 mb-1">Elige una nueva contraseña</h1>
          <p className="text-gray-500 text-sm mb-6">
            Un administrador te dio una contraseña temporal. Antes de continuar, elige una nueva que solo tú conozcas.
          </p>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl px-4 py-3 mb-4 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Nueva contraseña</label>
              <input
                type="password"
                className="input"
                placeholder="Mínimo 6 caracteres"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="new-password"
              />
            </div>
            <div>
              <label className="label">Confirmar contraseña</label>
              <input
                type="password"
                className="input"
                placeholder="Repite la contraseña"
                value={confirmar}
                onChange={e => setConfirmar(e.target.value)}
                required
                autoComplete="new-password"
              />
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? 'Guardando...' : 'Guardar y continuar'}
            </button>
          </form>

          <button
            onClick={() => signOut({ callbackUrl: '/aplicante/login' })}
            className="w-full text-center text-xs text-gray-400 hover:text-red-500 mt-5"
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    </div>
  )
}

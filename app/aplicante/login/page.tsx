'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'

export default function AplicanteLoginPage() {
  const router = useRouter()
  const [cedula,    setCedula]    = useState('')
  const [password,  setPassword]  = useState('')
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const res = await signIn('aplicante-credentials', {
      cedula:   cedula.trim(),
      password,
      redirect: false,
    })

    if (res?.ok) {
      router.push('/aplicante/perfil')
    } else {
      setError('Cédula o contraseña incorrectos')
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <Image src="/logo.png" alt="Magic Dreams Productions" width={160} height={80} className="mx-auto object-contain" priority />
          <p className="text-gray-500 text-sm mt-3 tracking-widest uppercase">Portal de Aplicantes</p>
        </div>

        <div className="flex items-center justify-center gap-4 mb-6">
          <Image src="/logo_panatickets.png"  alt="Panatickets"     width={64} height={32} className="object-contain max-h-8 opacity-70 hover:opacity-100 transition-opacity" />
          <Image src="/logo_masterevents.png" alt="Master Events"   width={64} height={32} className="object-contain max-h-8 opacity-70 hover:opacity-100 transition-opacity" />
          <Image src="/logo_printmedia.png"   alt="Print Media PTY" width={64} height={32} className="object-contain max-h-8 opacity-70 hover:opacity-100 transition-opacity" />
        </div>

        <div className="card p-7">
          <h1 className="text-xl font-bold text-gray-900 mb-1">Iniciar sesión</h1>
          <p className="text-gray-500 text-sm mb-6">Accede con tu número de cédula y contraseña</p>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl px-4 py-3 mb-4 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Número de cédula</label>
              <input
                className="input"
                placeholder="Ej: 8-123-4567"
                value={cedula}
                onChange={e => setCedula(e.target.value)}
                required
                autoComplete="username"
              />
            </div>
            <div>
              <label className="label">Contraseña</label>
              <input
                type="password"
                className="input"
                placeholder="Tu contraseña"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? 'Ingresando...' : 'Ingresar'}
            </button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-5">
            ¿No tienes cuenta?{' '}
            <Link href="/aplicante/registro" className="text-gray-900 font-semibold hover:underline">
              Regístrate aquí
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}

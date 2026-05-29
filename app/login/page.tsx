'use client'

import { signIn, useSession } from 'next-auth/react'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (status === 'authenticated') {
      router.push(session?.user?.role === 'ADMIN' ? '/admin' : '/usuario/solicitar')
    }
  }, [status, session, router])

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo / Brand */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-brand-800/60 border border-gold-500/40 mb-4">
            <span className="text-3xl">✨</span>
          </div>
          <h1 className="text-3xl font-bold text-white">Magic Dreams</h1>
          <p className="text-brand-400 mt-1">Portal de Personal Eventual</p>
        </div>

        {/* Card */}
        <div className="card p-8">
          <h2 className="text-xl font-semibold text-white mb-2">Iniciar sesión</h2>
          <p className="text-brand-400 text-sm mb-8">
            Accede con tu cuenta de Microsoft corporativa.
          </p>

          <button
            onClick={() => signIn('azure-ad', { callbackUrl: '/' })}
            className="w-full flex items-center justify-center gap-3 bg-white hover:bg-gray-50 text-gray-800 font-semibold py-3 px-6 rounded-xl transition-all duration-200"
          >
            <MicrosoftIcon />
            Continuar con Microsoft
          </button>

          <div className="mt-8 pt-6 border-t border-brand-800/50">
            <p className="text-center text-brand-500 text-xs">
              ¿Eres personal eventual?{' '}
              <a href="/aplicante/registro" className="text-gold-400 hover:text-gold-300 font-medium">
                Regístrate aquí
              </a>
            </p>
          </div>
        </div>

        <p className="text-center text-brand-600 text-xs mt-6">
          © {new Date().getFullYear()} Magic Dreams · Uso interno
        </p>
      </div>
    </div>
  )
}

function MicrosoftIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 21 21" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="1" y="1" width="9" height="9" fill="#F25022"/>
      <rect x="11" y="1" width="9" height="9" fill="#7FBA00"/>
      <rect x="1" y="11" width="9" height="9" fill="#00A4EF"/>
      <rect x="11" y="11" width="9" height="9" fill="#FFB900"/>
    </svg>
  )
}

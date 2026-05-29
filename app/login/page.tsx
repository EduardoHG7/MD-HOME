'use client'

import { signIn, useSession } from 'next-auth/react'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'

export default function LoginPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (status === 'authenticated') {
      router.push(session?.user?.role === 'ADMIN' ? '/admin' : '/usuario/solicitar')
    }
  }, [status, session, router])

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-block">
            <Image
              src="/logo.png"
              alt="Magic Dreams Productions"
              width={220}
              height={110}
              className="mx-auto"
              priority
            />
          </div>
          <p className="text-gray-500 text-sm mt-3 tracking-widest uppercase">
            Portal de Personal Eventual
          </p>
        </div>

        {/* Card */}
        <div className="card p-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-1">Iniciar sesión</h2>
          <p className="text-gray-500 text-sm mb-8">
            Accede con tu cuenta de Microsoft corporativa.
          </p>

          <button
            onClick={() => signIn('azure-ad', { callbackUrl: '/' })}
            className="w-full flex items-center justify-center gap-3 bg-gray-900 hover:bg-gray-700 text-white font-semibold py-3 px-6 rounded-xl transition-all duration-200"
          >
            <MicrosoftIcon />
            Continuar con Microsoft
          </button>

          <div className="mt-8 pt-6 border-t border-gray-100">
            <p className="text-center text-gray-500 text-xs">
              ¿Eres personal eventual?{' '}
              <a href="/aplicante/registro" className="text-brand-700 hover:text-brand-900 font-semibold">
                Regístrate aquí
              </a>
            </p>
          </div>
        </div>

        <p className="text-center text-gray-400 text-xs mt-6">
          © {new Date().getFullYear()} Magic Dreams Productions · Uso interno
        </p>
      </div>
    </div>
  )
}

function MicrosoftIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 21 21" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="1" y="1" width="9" height="9" fill="#F25022"/>
      <rect x="11" y="1" width="9" height="9" fill="#7FBA00"/>
      <rect x="1" y="11" width="9" height="9" fill="#00A4EF"/>
      <rect x="11" y="11" width="9" height="9" fill="#FFB900"/>
    </svg>
  )
}

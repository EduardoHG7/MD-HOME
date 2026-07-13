'use client'

import { signIn, useSession } from 'next-auth/react'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { esOperadorPanatickets } from '@/lib/permisos'

export default function LoginPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (status === 'authenticated') {
      const dest = session?.user?.role === 'ADMIN'
        ? '/admin'
        : esOperadorPanatickets(session?.user?.email, session?.user?.role)
          ? '/admin/eventos'
          : '/usuario/solicitar'
      router.push(dest)
    }
  }, [status, session, router])

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">

        {/* Logo principal */}
        <div className="text-center mb-6">
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

        {/* Logos de empresas del holding */}
        <div className="flex items-center justify-center gap-4 mb-8">
          <Image src="/logo_panatickets.png"   alt="Panatickets"     width={72} height={36} className="object-contain max-h-9 opacity-70 hover:opacity-100 transition-opacity" />
          <Image src="/logo_masterevents.png"  alt="Master Events"   width={72} height={36} className="object-contain max-h-9 opacity-70 hover:opacity-100 transition-opacity" />
          <Image src="/logo_printmedia.png"    alt="Print Media PTY" width={72} height={36} className="object-contain max-h-9 opacity-70 hover:opacity-100 transition-opacity" />
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

          <div className="mt-8 pt-6 border-t border-gray-100 space-y-2 text-center">
            <p className="text-gray-500 text-xs">
              ¿Eres personal eventual?{' '}
              <a href="/aplicante/login" className="text-gray-900 hover:text-black font-semibold underline">
                Inicia sesión aquí
              </a>
            </p>
            <p className="text-gray-400 text-xs">
              ¿Primera vez?{' '}
              <a href="/aplicante/registro" className="text-gray-600 hover:text-black font-semibold underline">
                Regístrate
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

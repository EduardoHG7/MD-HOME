'use client'

import { signOut } from 'next-auth/react'
import { Session } from 'next-auth'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTenant } from '@/hooks/useTenant'

const NAV_ITEMS = [
  { href: '/usuario',              label: '🏠 Inicio' },
  { href: '/usuario/solicitar',    label: '📋 Solicitudes' },
  { href: '/usuario/cotizaciones', label: '💰 Cotizaciones' },
  { href: '/usuario/facturas',     label: '🧾 Facturas' },
]

export function UserNav({ session }: { session: Session }) {
  const pathname = usePathname()
  const { activeTenant } = useTenant()

  const logoSrc = activeTenant?.logo ?? '/logo.png'
  const logoAlt = activeTenant?.nombre ?? 'Logo'

  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Image
            src={logoSrc}
            alt={logoAlt}
            width={130}
            height={65}
            className="object-contain max-h-12"
            priority
          />
          {(session.user.availableTenants?.length ?? 0) > 1 && (
            <Link
              href="/seleccionar-empresa"
              className="text-xs text-blue-600 hover:text-blue-800"
              title="Cambiar empresa"
            >
              🔄
            </Link>
          )}
        </div>

        <nav className="flex items-center gap-1">
          {NAV_ITEMS.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                (item.href === '/usuario' ? pathname === '/usuario' : pathname.startsWith(item.href))
                  ? 'bg-gray-900 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <span className="text-gray-500 text-sm hidden sm:block">
            {session.user?.name ?? session.user?.email}
          </span>
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="text-sm text-gray-500 hover:text-red-600 px-3 py-1.5 rounded-xl hover:bg-red-50 transition-all"
          >
            Salir
          </button>
        </div>
      </div>
    </header>
  )
}

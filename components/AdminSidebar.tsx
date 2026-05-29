'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { Session } from 'next-auth'
import Image from 'next/image'

const NAV_ITEMS = [
  { href: '/admin',             label: 'Dashboard',   icon: '◉' },
  { href: '/admin/solicitudes', label: 'Solicitudes', icon: '📋' },
  { href: '/admin/aplicantes',  label: 'Aplicantes',  icon: '👥' },
  { href: '/admin/eventos',     label: 'Eventos',     icon: '🎪' },
  { href: '/admin/tarifas',     label: 'Tarifas',     icon: '💰' },
]

export function AdminSidebar({ session }: { session: Session }) {
  const pathname = usePathname()

  return (
    <aside className="w-64 fixed left-0 top-0 h-full bg-white border-r border-gray-200 flex flex-col">
      {/* Logo */}
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-center">
        <Image
          src="/logo.png"
          alt="Magic Dreams Productions"
          width={160}
          height={80}
          className="object-contain"
          priority
        />
      </div>

      {/* Badge */}
      <div className="px-4 py-2 border-b border-gray-100">
        <span className="text-xs font-semibold text-gray-600 bg-gray-100 border border-gray-200 rounded-full px-3 py-1">
          Panel Administrativo
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map(item => {
          const active = pathname === item.href || (item.href !== '/admin' && pathname.startsWith(item.href))
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                active
                  ? 'bg-gray-900 text-white shadow-sm'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* User */}
      <div className="p-3 border-t border-gray-100">
        <div className="flex items-center gap-3 px-3 py-2 mb-1 bg-gray-50 rounded-xl">
          <div className="w-8 h-8 rounded-full bg-gray-900 flex items-center justify-center text-sm font-bold text-white shrink-0">
            {session.user?.name?.[0] ?? session.user?.email?.[0] ?? 'A'}
          </div>
          <div className="min-w-0">
            <p className="text-gray-900 text-xs font-semibold truncate">{session.user?.name ?? 'Admin'}</p>
            <p className="text-gray-400 text-xs truncate">{session.user?.email}</p>
          </div>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="w-full text-left px-3 py-2 text-gray-500 hover:text-red-600 text-xs rounded-xl hover:bg-red-50 transition-all"
        >
          Cerrar sesión
        </button>
      </div>
    </aside>
  )
}

'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { Session } from 'next-auth'

const NAV_ITEMS = [
  { href: '/admin',            label: 'Dashboard',    icon: '◉' },
  { href: '/admin/solicitudes',label: 'Solicitudes',  icon: '📋' },
  { href: '/admin/aplicantes', label: 'Aplicantes',   icon: '👥' },
  { href: '/admin/eventos',    label: 'Eventos',      icon: '🎪' },
  { href: '/admin/tarifas',    label: 'Tarifas',      icon: '💰' },
]

export function AdminSidebar({ session }: { session: Session }) {
  const pathname = usePathname()

  return (
    <aside className="w-64 fixed left-0 top-0 h-full bg-brand-950/80 border-r border-brand-800/40 backdrop-blur-sm flex flex-col">
      {/* Brand */}
      <div className="p-5 border-b border-brand-800/40">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-brand-800/60 border border-gold-500/40 flex items-center justify-center text-lg">
            ✨
          </div>
          <div>
            <p className="font-bold text-white text-sm">Magic Dreams</p>
            <p className="text-brand-400 text-xs">Staff · Admin</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-1">
        {NAV_ITEMS.map(item => {
          const active = pathname === item.href || (item.href !== '/admin' && pathname.startsWith(item.href))
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                active
                  ? 'bg-brand-700/60 text-white'
                  : 'text-brand-400 hover:text-white hover:bg-brand-800/50'
              }`}
            >
              <span>{item.icon}</span>
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* User */}
      <div className="p-3 border-t border-brand-800/40">
        <div className="flex items-center gap-3 px-3 py-2 mb-1">
          <div className="w-8 h-8 rounded-full bg-brand-700 flex items-center justify-center text-sm font-bold text-white shrink-0">
            {session.user?.name?.[0] ?? session.user?.email?.[0] ?? 'A'}
          </div>
          <div className="min-w-0">
            <p className="text-white text-xs font-medium truncate">{session.user?.name ?? 'Admin'}</p>
            <p className="text-brand-500 text-xs truncate">{session.user?.email}</p>
          </div>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="w-full text-left px-3 py-2 text-brand-400 hover:text-red-400 text-xs rounded-xl hover:bg-red-500/10 transition-all"
        >
          Cerrar sesión
        </button>
      </div>
    </aside>
  )
}

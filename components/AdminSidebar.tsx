'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { Session } from 'next-auth'
import Image from 'next/image'
import { useState, useEffect } from 'react'
import { useTenant } from '@/hooks/useTenant'

const ADMIN_NAV = [
  { href: '/admin',                label: 'Dashboard',       icon: '◉' },
  { href: '/admin/solicitudes',    label: 'Solicitudes',     icon: '📋' },
  { href: '/admin/usuarios',       label: 'Usuarios',        icon: '👥' },
  { href: '/admin/aplicantes',     label: 'Aplicantes',      icon: '👥' },
  { href: '/admin/eventos',        label: 'Eventos',         icon: '🎪' },
  { href: '/admin/venues',         label: 'Venues',          icon: '🏟️' },
  { href: '/admin/patrocinadores', label: 'Patrocinadores',  icon: '🤝' },
  { href: '/admin/puestos',        label: 'Puestos',         icon: '🔧' },
  { href: '/admin/facturas',       label: 'Facturas',        icon: '🧾' },
  { href: '/admin/tarifas',        label: 'Tarifas',         icon: '💰' },
]

const CONTABILIDAD_NAV = [
  { href: '/contabilidad',              label: 'Dashboard',    icon: '◉' },
  { href: '/contabilidad/solicitudes',  label: 'Solicitudes',  icon: '📋' },
]

export function AdminSidebar({ session, role }: { session: Session; role?: string }) {
  const efectiveRole = role ?? 'ADMIN'
  const rootHref     = efectiveRole === 'CONTABILIDAD' ? '/contabilidad' : '/admin'
  const panelLabel   = efectiveRole === 'CONTABILIDAD' ? 'Panel Contabilidad' : 'Panel Administrativo'
  const baseNav      = efectiveRole === 'CONTABILIDAD' ? CONTABILIDAD_NAV : ADMIN_NAV
  const pathname     = usePathname()
  const [open, setOpen] = useState(false)
  const { activeTenant } = useTenant()

  // Append Empresas link for super-admins
  const NAV_ITEMS = session.user.isSuperAdmin
    ? [...baseNav, { href: '/admin/tenants', label: 'Empresas', icon: '🏢' }]
    : baseNav

  // Logo: active tenant logo or fallback /logo.png
  const logoSrc    = activeTenant?.logo ?? '/logo.png'
  const logoAlt    = activeTenant?.nombre ?? 'Logo'
  const tenantName = activeTenant?.nombre

  useEffect(() => { setOpen(false) }, [pathname])
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  const sidebarContent = (
    <aside className="w-64 h-full bg-white border-r border-gray-200 flex flex-col">
      <div className="px-5 py-4 border-b border-gray-100 flex flex-col items-center gap-1">
        <Image src={logoSrc} alt={logoAlt} width={200} height={100} className="object-contain max-h-24" priority />
      </div>

      <div className="px-4 py-2 border-b border-gray-100 flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-600 bg-gray-100 border border-gray-200 rounded-full px-3 py-1">
          {panelLabel}
        </span>
        <Link
          href="/seleccionar-empresa"
          className="text-xs text-blue-600 hover:text-blue-800 font-medium"
          title="Cambiar empresa"
        >
          🔄
        </Link>
      </div>

      {tenantName && (
        <div className="px-4 py-1.5 bg-blue-50 border-b border-blue-100 text-center">
          <span className="text-xs font-semibold text-blue-700">{tenantName}</span>
        </div>
      )}

      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map(item => {
          const active = pathname === item.href || (item.href !== rootHref && pathname.startsWith(item.href))
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                active ? 'bg-gray-900 text-white shadow-sm' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </Link>
          )
        })}
      </nav>

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

  return (
    <>
      <div className="hidden lg:block fixed left-0 top-0 h-full w-64 z-30">
        {sidebarContent}
      </div>

      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-white border-b border-gray-200 flex items-center px-4 h-14">
        <button
          onClick={() => setOpen(true)}
          className="p-2 rounded-xl hover:bg-gray-100 transition-all"
          aria-label="Abrir menú"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="3" y1="6"  x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <div className="flex-1 flex justify-center">
          <Image src={logoSrc} alt={logoAlt} width={90} height={36} className="object-contain max-h-9" priority />
        </div>
        <div className="w-10" />
      </div>

      {open && (
        <div className="lg:hidden fixed inset-0 z-40 bg-black/40" onClick={() => setOpen(false)} />
      )}

      <div className={`lg:hidden fixed top-0 left-0 h-full w-64 z-50 transform transition-transform duration-300 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        {sidebarContent}
      </div>
    </>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'

interface User {
  id:        string
  name:      string | null
  email:     string
  role:      string
  createdAt: string
}

const ROLE_LABELS: Record<string, string> = {
  ADMIN:        '👑 Admin',
  CONTABILIDAD: '📊 Contabilidad',
  USER:         '👤 Usuario',
}

const ROLE_STYLES: Record<string, string> = {
  ADMIN:        'bg-gray-900 text-white border-gray-900',
  CONTABILIDAD: 'bg-blue-700 text-white border-blue-700',
  USER:         'bg-gray-100 text-gray-600 border-gray-200',
}

export default function UsuariosAdminPage() {
  const { data: session } = useSession()
  const [users,   setUsers]   = useState<User[]>([])
  const [loading, setLoading] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/usuarios').then(r => r.json()).then(d => {
      if (Array.isArray(d)) setUsers(d)
    })
  }, [])

  async function setRole(user: User, newRole: string) {
    if (!confirm(`¿Cambiar rol de ${user.name ?? user.email} a ${ROLE_LABELS[newRole]}?`)) return
    setLoading(user.id)
    const res = await fetch(`/api/usuarios/${user.id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: newRole }),
    })
    if (res.ok) {
      const updated = await res.json()
      setUsers(prev => prev.map(u => u.id === updated.id ? updated : u))
    }
    setLoading(null)
  }

  const admins       = users.filter(u => u.role === 'ADMIN')
  const contabilidad = users.filter(u => u.role === 'CONTABILIDAD')
  const normales     = users.filter(u => u.role === 'USER')

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Gestión de Usuarios</h1>
        <p className="text-gray-500 mt-1">Administra los roles de los usuarios registrados</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="card p-4 text-center">
          <p className="text-3xl font-bold text-gray-900">{admins.length}</p>
          <p className="text-gray-500 text-sm mt-1">Administradores</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-3xl font-bold text-blue-700">{contabilidad.length}</p>
          <p className="text-gray-500 text-sm mt-1">Contabilidad</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-3xl font-bold text-gray-900">{normales.length}</p>
          <p className="text-gray-500 text-sm mt-1">Usuarios internos</p>
        </div>
      </div>

      {admins.length > 0 && (
        <Section title="Administradores">
          {admins.map(u => (
            <UserRow key={u.id} user={u} isSelf={u.id === session?.user?.id} loading={loading === u.id} onSetRole={r => setRole(u, r)} />
          ))}
        </Section>
      )}

      {contabilidad.length > 0 && (
        <Section title="Contabilidad">
          {contabilidad.map(u => (
            <UserRow key={u.id} user={u} isSelf={false} loading={loading === u.id} onSetRole={r => setRole(u, r)} />
          ))}
        </Section>
      )}

      {normales.length > 0 && (
        <Section title="Usuarios Internos">
          {normales.map(u => (
            <UserRow key={u.id} user={u} isSelf={false} loading={loading === u.id} onSetRole={r => setRole(u, r)} />
          ))}
        </Section>
      )}

      {users.length === 0 && (
        <div className="card p-10 text-center">
          <p className="text-4xl mb-3">👥</p>
          <p className="text-gray-700 font-semibold">No hay usuarios registrados aún</p>
          <p className="text-gray-400 text-sm mt-1">Los usuarios aparecen cuando inician sesión por primera vez</p>
        </div>
      )}

      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700">
        💡 Los usuarios deben iniciar sesión al menos una vez para aparecer aquí. Comparte el link de la plataforma con tus compañeros para que se registren.
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">{title}</h2>
      <div className="card divide-y divide-gray-100">{children}</div>
    </div>
  )
}

function UserRow({ user, isSelf, loading, onSetRole }: {
  user:     User
  isSelf:   boolean
  loading:  boolean
  onSetRole: (role: string) => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div className="flex items-center gap-4 px-5 py-4">
      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold shrink-0 ${
        user.role === 'ADMIN' ? 'bg-gray-900' : user.role === 'CONTABILIDAD' ? 'bg-blue-700' : 'bg-gray-400'
      }`}>
        {(user.name?.[0] ?? user.email[0]).toUpperCase()}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-semibold text-gray-900 truncate">{user.name ?? '—'}</p>
          {isSelf && <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Tú</span>}
        </div>
        <p className="text-gray-500 text-sm truncate">{user.email}</p>
      </div>

      <span className={`text-xs font-semibold px-3 py-1 rounded-full border ${ROLE_STYLES[user.role] ?? ROLE_STYLES.USER}`}>
        {ROLE_LABELS[user.role] ?? user.role}
      </span>

      {!isSelf && (
        <div className="relative">
          <button
            onClick={() => setMenuOpen(v => !v)}
            disabled={loading}
            className="text-sm px-3 py-1.5 rounded-xl border-2 border-gray-200 text-gray-600 hover:bg-gray-50 font-medium transition-all"
          >
            {loading ? '...' : 'Cambiar rol ▾'}
          </button>
          {menuOpen && (
            <div className="absolute right-0 mt-1 w-44 bg-white border border-gray-200 rounded-xl shadow-lg z-10 overflow-hidden">
              {['ADMIN', 'CONTABILIDAD', 'USER'].filter(r => r !== user.role).map(r => (
                <button key={r} onClick={() => { onSetRole(r); setMenuOpen(false) }}
                  className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 transition-all">
                  {ROLE_LABELS[r]}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

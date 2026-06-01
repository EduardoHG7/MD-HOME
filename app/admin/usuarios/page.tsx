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

export default function UsuariosAdminPage() {
  const { data: session } = useSession()
  const [users,   setUsers]   = useState<User[]>([])
  const [loading, setLoading] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/usuarios').then(r => r.json()).then(d => {
      if (Array.isArray(d)) setUsers(d)
    })
  }, [])

  async function toggleRole(user: User) {
    const newRole = user.role === 'ADMIN' ? 'USER' : 'ADMIN'
    const accion  = newRole === 'ADMIN' ? 'hacer ADMIN' : 'quitar el rol de ADMIN'
    if (!confirm(`¿Deseas ${accion} a ${user.name ?? user.email}?`)) return

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

  const admins  = users.filter(u => u.role === 'ADMIN')
  const normales = users.filter(u => u.role === 'USER')

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Gestión de Usuarios</h1>
        <p className="text-gray-500 mt-1">Administra los roles de los usuarios que han iniciado sesión</p>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-2 gap-4">
        <div className="card p-4 text-center">
          <p className="text-3xl font-bold text-gray-900">{admins.length}</p>
          <p className="text-gray-500 text-sm mt-1">Administradores</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-3xl font-bold text-gray-900">{normales.length}</p>
          <p className="text-gray-500 text-sm mt-1">Usuarios internos</p>
        </div>
      </div>

      {/* Lista de admins */}
      {admins.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Administradores</h2>
          <div className="card divide-y divide-gray-100">
            {admins.map(u => (
              <UserRow
                key={u.id}
                user={u}
                isSelf={u.id === session?.user?.id}
                loading={loading === u.id}
                onToggle={() => toggleRole(u)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Lista de usuarios normales */}
      {normales.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Usuarios Internos</h2>
          <div className="card divide-y divide-gray-100">
            {normales.map(u => (
              <UserRow
                key={u.id}
                user={u}
                isSelf={false}
                loading={loading === u.id}
                onToggle={() => toggleRole(u)}
              />
            ))}
          </div>
        </div>
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

function UserRow({ user, isSelf, loading, onToggle }: {
  user:     User
  isSelf:   boolean
  loading:  boolean
  onToggle: () => void
}) {
  const isAdmin = user.role === 'ADMIN'

  return (
    <div className="flex items-center gap-4 px-5 py-4">
      {/* Avatar */}
      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold shrink-0 ${
        isAdmin ? 'bg-gray-900' : 'bg-gray-400'
      }`}>
        {(user.name?.[0] ?? user.email[0]).toUpperCase()}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-semibold text-gray-900 truncate">{user.name ?? '—'}</p>
          {isSelf && <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Tú</span>}
        </div>
        <p className="text-gray-500 text-sm truncate">{user.email}</p>
      </div>

      {/* Badge de rol */}
      <span className={`text-xs font-semibold px-3 py-1 rounded-full border ${
        isAdmin
          ? 'bg-gray-900 text-white border-gray-900'
          : 'bg-gray-100 text-gray-600 border-gray-200'
      }`}>
        {isAdmin ? '👑 Admin' : '👤 Usuario'}
      </span>

      {/* Botón de cambio */}
      {!isSelf && (
        <button
          onClick={onToggle}
          disabled={loading}
          className={`text-sm px-4 py-1.5 rounded-xl border-2 font-medium transition-all ${
            isAdmin
              ? 'border-red-200 text-red-600 hover:bg-red-50'
              : 'border-gray-900 text-gray-900 hover:bg-gray-900 hover:text-white'
          }`}
        >
          {loading ? '...' : isAdmin ? 'Quitar Admin' : 'Hacer Admin'}
        </button>
      )}
    </div>
  )
}

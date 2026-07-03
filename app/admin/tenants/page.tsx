'use client'

import { useSession } from 'next-auth/react'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'

interface UserItem { id: string; name: string | null; email: string; role?: string }
interface UserTenantItem { id: string; role: string; user: UserItem }
interface Tenant {
  id: string; nombre: string; slug: string; logo: string | null; activo: boolean
  usuarios: UserTenantItem[]
}

const ROLE_LABELS: Record<string, string> = { ADMIN: 'Admin', USER: 'Usuario', CONTABILIDAD: 'Contabilidad' }

export default function TenantsAdminPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [tenants, setTenants]             = useState<Tenant[]>([])
  const [allUsers, setAllUsers]           = useState<UserItem[]>([])
  const [sinEmpresa, setSinEmpresa]       = useState<UserItem[]>([])
  const [loading, setLoading]             = useState(true)

  // Form state for new tenant
  const [newNombre, setNewNombre] = useState('')
  const [newSlug, setNewSlug]     = useState('')
  const [newLogo, setNewLogo]     = useState('')
  const [creating, setCreating]   = useState(false)

  // Add user state
  const [addingToTenant, setAddingToTenant] = useState<string | null>(null)
  const [addUserId, setAddUserId]           = useState('')
  const [addRole, setAddRole]               = useState('USER')
  const [saving, setSaving]                 = useState(false)

  // Bulk assign state
  const [bulkTenantId, setBulkTenantId]   = useState('')
  const [bulkRole, setBulkRole]           = useState('USER')
  const [bulkSelected, setBulkSelected]   = useState<Set<string>>(new Set())
  const [bulkSaving, setBulkSaving]       = useState(false)

  useEffect(() => {
    if (status === 'authenticated' && !session?.user?.isSuperAdmin) {
      router.replace('/admin')
    }
  }, [status, session, router])

  useEffect(() => {
    if (!session?.user?.isSuperAdmin) return
    Promise.all([
      fetch('/api/tenants').then(r => r.json()),
      fetch('/api/usuarios').then(r => r.json()),
      fetch('/api/usuarios/sin-empresa').then(r => r.json()),
    ]).then(([t, u, se]) => {
      if (Array.isArray(t))  setTenants(t)
      if (Array.isArray(u))  setAllUsers(u)
      if (Array.isArray(se)) setSinEmpresa(se)
      setLoading(false)
    })
  }, [session])

  async function createTenant() {
    if (!newNombre || !newSlug) return
    setCreating(true)
    const res = await fetch('/api/tenants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre: newNombre, slug: newSlug, logo: newLogo || null }),
    })
    if (res.ok) {
      const t = await res.json()
      setTenants(prev => [...prev, { ...t, usuarios: [] }])
      setNewNombre(''); setNewSlug(''); setNewLogo('')
    }
    setCreating(false)
  }

  async function addUserToTenant(tenantId: string) {
    if (!addUserId) return
    setSaving(true)
    const res = await fetch(`/api/tenants/${tenantId}/usuarios`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: addUserId, role: addRole }),
    })
    if (res.ok) {
      const user = allUsers.find(u => u.id === addUserId)
      setTenants(prev => prev.map(t =>
        t.id === tenantId
          ? { ...t, usuarios: [...t.usuarios.filter(u => u.user.id !== addUserId), { id: Date.now().toString(), role: addRole, user: user! }] }
          : t
      ))
      setAddingToTenant(null); setAddUserId(''); setAddRole('USER')
    }
    setSaving(false)
  }

  async function removeUser(tenantId: string, userId: string) {
    await fetch(`/api/tenants/${tenantId}/usuarios`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    })
    setTenants(prev => prev.map(t =>
      t.id === tenantId ? { ...t, usuarios: t.usuarios.filter(u => u.user.id !== userId) } : t
    ))
  }

  async function bulkAssign() {
    if (!bulkTenantId || bulkSelected.size === 0) return
    setBulkSaving(true)
    await Promise.all(
      Array.from(bulkSelected).map(userId =>
        fetch(`/api/tenants/${bulkTenantId}/usuarios`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, role: bulkRole }),
        })
      )
    )
    // Update local state
    const assignedUsers = sinEmpresa.filter(u => bulkSelected.has(u.id))
    setTenants(prev => prev.map(t =>
      t.id === bulkTenantId
        ? { ...t, usuarios: [...t.usuarios, ...assignedUsers.map(u => ({ id: Date.now().toString() + u.id, role: bulkRole, user: u }))] }
        : t
    ))
    setSinEmpresa(prev => prev.filter(u => !bulkSelected.has(u.id)))
    setBulkSelected(new Set())
    setBulkTenantId('')
    setBulkSaving(false)
  }

  function toggleBulk(id: string) {
    setBulkSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  if (!session?.user?.isSuperAdmin) return null
  if (loading) return <div className="p-6 text-gray-400">Cargando...</div>

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Gestión de Empresas</h1>
        <p className="text-gray-500 mt-1 text-sm">Administra los tenants del holding</p>
      </div>

      {/* Usuarios sin empresa */}
      {sinEmpresa.length > 0 && (
        <div className="card p-5 border-l-4 border-l-orange-400">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-orange-500 text-lg">⚠️</span>
            <h2 className="font-semibold text-gray-900">Usuarios sin empresa asignada ({sinEmpresa.length})</h2>
          </div>
          <p className="text-sm text-gray-500 mb-4">Estos usuarios no pueden entrar al sistema. Selecciónalos y asígnalos a una empresa.</p>

          <div className="divide-y divide-gray-100 mb-4">
            {sinEmpresa.map(u => (
              <label key={u.id} className="flex items-center gap-3 py-2.5 cursor-pointer hover:bg-gray-50 px-1 rounded">
                <input
                  type="checkbox"
                  checked={bulkSelected.has(u.id)}
                  onChange={() => toggleBulk(u.id)}
                  className="w-4 h-4 rounded"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{u.name ?? u.email}</p>
                  <p className="text-xs text-gray-400 truncate">{u.email}</p>
                </div>
              </label>
            ))}
          </div>

          <div className="flex gap-2 flex-wrap items-center">
            <button
              onClick={() => setBulkSelected(new Set(sinEmpresa.map(u => u.id)))}
              className="text-xs text-blue-600 hover:underline"
            >
              Seleccionar todos
            </button>
            <button
              onClick={() => setBulkSelected(new Set())}
              className="text-xs text-gray-400 hover:underline"
            >
              Limpiar
            </button>
            <div className="flex-1" />
            <select
              value={bulkTenantId}
              onChange={e => setBulkTenantId(e.target.value)}
              className="input w-48"
            >
              <option value="">Empresa...</option>
              {tenants.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
            </select>
            <select value={bulkRole} onChange={e => setBulkRole(e.target.value)} className="input w-36">
              <option value="USER">Usuario</option>
              <option value="ADMIN">Admin</option>
              <option value="CONTABILIDAD">Contabilidad</option>
            </select>
            <button
              onClick={bulkAssign}
              disabled={bulkSaving || bulkSelected.size === 0 || !bulkTenantId}
              className="btn-primary whitespace-nowrap"
            >
              {bulkSaving ? 'Asignando...' : `Asignar (${bulkSelected.size})`}
            </button>
          </div>
        </div>
      )}

      {sinEmpresa.length === 0 && !loading && (
        <div className="card p-4 text-sm text-green-700 bg-green-50 border border-green-200">
          ✅ Todos los usuarios tienen al menos una empresa asignada.
        </div>
      )}

      {/* Create tenant */}
      <div className="card p-5">
        <h2 className="font-semibold text-gray-900 mb-4">Nueva empresa</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
          <input
            value={newNombre} onChange={e => setNewNombre(e.target.value)}
            placeholder="Nombre (ej: Magic Dreams)"
            className="input"
          />
          <input
            value={newSlug} onChange={e => setNewSlug(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
            placeholder="Slug (ej: magic-dreams)"
            className="input"
          />
          <input
            value={newLogo} onChange={e => setNewLogo(e.target.value)}
            placeholder="URL del logo (opcional)"
            className="input"
          />
        </div>
        <button
          onClick={createTenant}
          disabled={creating || !newNombre || !newSlug}
          className="btn-primary"
        >
          {creating ? 'Creando...' : '+ Crear empresa'}
        </button>
      </div>

      {/* Tenant list */}
      {tenants.map(tenant => (
        <div key={tenant.id} className="card p-5">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 rounded-xl bg-gray-100 overflow-hidden flex items-center justify-center shrink-0">
              {tenant.logo ? (
                <Image src={tenant.logo} alt={tenant.nombre} width={48} height={48} className="object-contain" />
              ) : (
                <span className="text-2xl">🏢</span>
              )}
            </div>
            <div>
              <h2 className="font-bold text-gray-900">{tenant.nombre}</h2>
              <p className="text-xs text-gray-400">{tenant.slug}</p>
            </div>
          </div>

          <div className="divide-y divide-gray-100">
            {tenant.usuarios.map(ut => (
              <div key={ut.id} className="flex items-center gap-3 py-2.5">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{ut.user.name ?? ut.user.email}</p>
                  <p className="text-xs text-gray-400 truncate">{ut.user.email}</p>
                </div>
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
                  {ROLE_LABELS[ut.role] ?? ut.role}
                </span>
                <button
                  onClick={() => removeUser(tenant.id, ut.user.id)}
                  className="text-xs text-red-500 hover:text-red-700 px-2 py-1"
                >
                  Quitar
                </button>
              </div>
            ))}
            {tenant.usuarios.length === 0 && (
              <p className="text-sm text-gray-400 py-2">Sin usuarios asignados</p>
            )}
          </div>

          {addingToTenant === tenant.id ? (
            <div className="mt-4 flex gap-2 flex-wrap">
              <select
                value={addUserId} onChange={e => setAddUserId(e.target.value)}
                className="input flex-1 min-w-0"
              >
                <option value="">Seleccionar usuario...</option>
                {allUsers
                  .filter(u => !tenant.usuarios.find(ut => ut.user.id === u.id))
                  .map(u => (
                    <option key={u.id} value={u.id}>{u.name ?? u.email} — {u.email}</option>
                  ))
                }
              </select>
              <select value={addRole} onChange={e => setAddRole(e.target.value)} className="input w-36">
                <option value="USER">Usuario</option>
                <option value="ADMIN">Admin</option>
                <option value="CONTABILIDAD">Contabilidad</option>
              </select>
              <button
                onClick={() => addUserToTenant(tenant.id)}
                disabled={saving || !addUserId}
                className="btn-primary whitespace-nowrap"
              >
                {saving ? '...' : 'Agregar'}
              </button>
              <button onClick={() => setAddingToTenant(null)} className="btn-secondary">Cancelar</button>
            </div>
          ) : (
            <button
              onClick={() => setAddingToTenant(tenant.id)}
              className="mt-3 text-sm text-blue-600 hover:text-blue-800 font-medium"
            >
              + Agregar usuario
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

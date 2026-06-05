'use client'

import { useEffect, useState } from 'react'

interface Venue { id: string; nombre: string; direccion: string | null; activo: boolean }

export default function VenuesPage() {
  const [venues,   setVenues]   = useState<Venue[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editing,  setEditing]  = useState<Venue | null>(null)
  const [loading,  setLoading]  = useState(false)
  const [form,     setForm]     = useState({ nombre: '', direccion: '' })
  const [editForm, setEditForm] = useState({ nombre: '', direccion: '' })

  useEffect(() => {
    fetch('/api/venues').then(r => r.json()).then(d => setVenues(Array.isArray(d) ? d : []))
  }, [])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const res = await fetch('/api/venues', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    if (res.ok) {
      const v = await res.json()
      setVenues(prev => [...prev, v].sort((a, b) => a.nombre.localeCompare(b.nombre)))
      setForm({ nombre: '', direccion: '' })
      setShowForm(false)
    }
    setLoading(false)
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editing) return
    setLoading(true)
    const res = await fetch(`/api/venues/${editing.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editForm),
    })
    if (res.ok) {
      const updated = await res.json()
      setVenues(prev => prev.map(v => v.id === updated.id ? updated : v))
      setEditing(null)
    }
    setLoading(false)
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Desactivar este venue?')) return
    const res = await fetch(`/api/venues/${id}`, { method: 'DELETE' })
    if (res.ok) setVenues(prev => prev.filter(v => v.id !== id))
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Venues</h1>
          <p className="text-gray-500 mt-1">{venues.length} venue(s) registrado(s)</p>
        </div>
        <button onClick={() => setShowForm(v => !v)} className="btn-primary">
          {showForm ? 'Cancelar' : '+ Nuevo Venue'}
        </button>
      </div>

      {showForm && (
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Nuevo Venue</h2>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="label">Nombre del venue *</label>
              <input className="input" placeholder="Ej: Figali Convention Center" required
                value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} />
            </div>
            <div>
              <label className="label">Dirección (opcional)</label>
              <input className="input" placeholder="Ej: Amador, Ciudad de Panamá"
                value={form.direccion} onChange={e => setForm(f => ({ ...f, direccion: e.target.value }))} />
            </div>
            <button type="submit" disabled={loading} className="btn-primary">
              {loading ? 'Guardando...' : 'Crear Venue'}
            </button>
          </form>
        </div>
      )}

      <div className="space-y-2">
        {venues.map(v => (
          <div key={v.id} className="card p-4 flex items-center justify-between hover:shadow-md transition-shadow">
            <div>
              <p className="font-semibold text-gray-900">{v.nombre}</p>
              {v.direccion && <p className="text-gray-400 text-sm mt-0.5">📍 {v.direccion}</p>}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => { setEditing(v); setEditForm({ nombre: v.nombre, direccion: v.direccion ?? '' }) }}
                className="p-2 rounded-xl border border-gray-200 hover:border-gray-400 hover:bg-gray-50 transition-all text-gray-500"
                title="Editar"
              >✏️</button>
              <button
                onClick={() => handleDelete(v.id)}
                className="p-2 rounded-xl border border-red-100 hover:border-red-300 hover:bg-red-50 transition-all text-red-400"
                title="Eliminar"
              >🗑</button>
            </div>
          </div>
        ))}
        {venues.length === 0 && (
          <div className="card p-8 text-center">
            <p className="text-3xl mb-3">🏟️</p>
            <p className="text-gray-700 font-semibold">No hay venues aún</p>
            <p className="text-gray-400 text-sm mt-1">Crea el primero para poder asignarlo a los eventos.</p>
          </div>
        )}
      </div>

      {/* Modal edición */}
      {editing && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="card p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-gray-900">Editar Venue</h2>
              <button onClick={() => setEditing(null)} className="text-gray-400 hover:text-gray-700 text-xl">✕</button>
            </div>
            <form onSubmit={handleEdit} className="space-y-4">
              <div>
                <label className="label">Nombre *</label>
                <input className="input" required
                  value={editForm.nombre} onChange={e => setEditForm(f => ({ ...f, nombre: e.target.value }))} />
              </div>
              <div>
                <label className="label">Dirección</label>
                <input className="input" placeholder="Opcional..."
                  value={editForm.direccion} onChange={e => setEditForm(f => ({ ...f, direccion: e.target.value }))} />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setEditing(null)} className="btn-ghost flex-1">Cancelar</button>
                <button type="submit" disabled={loading} className="btn-primary flex-1">
                  {loading ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

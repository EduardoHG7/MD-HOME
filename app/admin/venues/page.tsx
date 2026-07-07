'use client'

import { useEffect, useState } from 'react'
import { formatDate } from '@/lib/utils'

interface EventoVenue {
  id: string; nombre: string; fechaInicio: string; fechaFin: string; estado: string
}
interface Venue {
  id: string; nombre: string; direccion: string | null; activo: boolean
  eventos: EventoVenue[]
}

const ESTADO_STYLES: Record<string, string> = {
  POR_CONFIRMAR: 'bg-purple-100 text-purple-700',
  POR_INICIAR:   'bg-blue-100 text-blue-700',
  ACTIVO:        'bg-green-100 text-green-700',
  COMPLETADO:    'bg-gray-100 text-gray-600',
}

const ESTADO_LABELS: Record<string, string> = {
  POR_CONFIRMAR: 'Por confirmar',
  POR_INICIAR:   'Por iniciar',
  ACTIVO:        'Activo',
  COMPLETADO:    'Completado',
}

export default function VenuesPage() {
  const [venues,   setVenues]   = useState<Venue[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editing,  setEditing]  = useState<Venue | null>(null)
  const [abierto,  setAbierto]  = useState<string | null>(null)
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
      setVenues(prev => [...prev, { ...v, eventos: [] }].sort((a, b) => a.nombre.localeCompare(b.nombre)))
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
      setVenues(prev => prev.map(v => v.id === updated.id ? { ...v, ...updated, eventos: v.eventos } : v))
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
        {venues.map(v => {
          const isOpen = abierto === v.id
          const numEventos = v.eventos?.length ?? 0
          return (
            <div key={v.id} className="card overflow-hidden hover:shadow-md transition-shadow">
              <div className="p-4 flex items-center justify-between">
                <button
                  onClick={() => numEventos > 0 && setAbierto(isOpen ? null : v.id)}
                  className={`flex-1 min-w-0 text-left ${numEventos > 0 ? 'cursor-pointer' : 'cursor-default'}`}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-gray-900">{v.nombre}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      numEventos > 0 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-400'
                    }`}>
                      🎪 {numEventos} evento(s)
                    </span>
                    {numEventos > 0 && (
                      <span className="text-gray-400 text-xs">{isOpen ? '▲ ocultar' : '▼ ver eventos'}</span>
                    )}
                  </div>
                  {v.direccion && <p className="text-gray-400 text-sm mt-0.5">📍 {v.direccion}</p>}
                </button>
                <div className="flex gap-2 shrink-0 ml-3">
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

              {isOpen && numEventos > 0 && (
                <div className="border-t border-gray-100 bg-gray-50 px-4 py-3 space-y-1.5">
                  {v.eventos.map(ev => (
                    <div key={ev.id} className="flex items-center gap-2 text-sm">
                      <div className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                      <span className="text-gray-700 font-medium truncate">{ev.nombre}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${ESTADO_STYLES[ev.estado] ?? 'bg-gray-100 text-gray-500'}`}>
                        {ESTADO_LABELS[ev.estado] ?? ev.estado}
                      </span>
                      <span className="text-gray-400 text-xs shrink-0 ml-auto">
                        {formatDate(ev.fechaInicio)} – {formatDate(ev.fechaFin)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
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

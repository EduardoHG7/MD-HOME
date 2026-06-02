'use client'

import { useEffect, useState } from 'react'
import { formatDate } from '@/lib/utils'

interface Evento {
  id: string
  nombre: string
  descripcion: string | null
  fechaInicio: string
  fechaFin: string
  estado: string
  _count: { asignaciones: number }
}

function toInputDate(iso: string) {
  return iso.split('T')[0]
}

export default function EventosPage() {
  const [eventos,   setEventos]   = useState<Evento[]>([])
  const [showForm,  setShowForm]  = useState(false)
  const [editing,   setEditing]   = useState<Evento | null>(null)
  const [loading,   setLoading]   = useState(false)
  const [form,      setForm]      = useState({ nombre: '', descripcion: '', fechaInicio: '', fechaFin: '' })
  const [editForm,  setEditForm]  = useState({ nombre: '', descripcion: '', fechaInicio: '', fechaFin: '', estado: '' })

  useEffect(() => {
    fetch('/api/eventos').then(r => r.json()).then(setEventos)
  }, [])

  function openEdit(ev: Evento) {
    setEditing(ev)
    setEditForm({
      nombre:      ev.nombre,
      descripcion: ev.descripcion ?? '',
      fechaInicio: toInputDate(ev.fechaInicio),
      fechaFin:    toInputDate(ev.fechaFin),
      estado:      ev.estado,
    })
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const res = await fetch('/api/eventos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    if (res.ok) {
      const ev = await res.json()
      setEventos(prev => [{ ...ev, _count: { asignaciones: 0 } }, ...prev])
      setForm({ nombre: '', descripcion: '', fechaInicio: '', fechaFin: '' })
      setShowForm(false)
    }
    setLoading(false)
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editing) return
    setLoading(true)
    const res = await fetch(`/api/eventos/${editing.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editForm),
    })
    if (res.ok) {
      const updated = await res.json()
      setEventos(prev => prev.map(ev => ev.id === updated.id ? updated : ev))
      setEditing(null)
    }
    setLoading(false)
  }

  const ESTADO_OPTS = ['ACTIVO', 'COMPLETADO', 'CANCELADO']
  const ESTADO_STYLES: Record<string, string> = {
    ACTIVO:     'bg-green-100 text-green-700',
    COMPLETADO: 'bg-gray-100 text-gray-600',
    CANCELADO:  'bg-red-100 text-red-600',
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gestión de Eventos</h1>
          <p className="text-gray-500 mt-1">{eventos.length} evento(s) registrado(s)</p>
        </div>
        <button onClick={() => setShowForm(v => !v)} className="btn-primary">
          {showForm ? 'Cancelar' : '+ Nuevo Evento'}
        </button>
      </div>

      {/* Formulario crear */}
      {showForm && (
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Crear Evento</h2>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="label">Nombre del evento *</label>
              <input className="input" placeholder="Ej: Concierto Navidad 2025" required
                value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} />
            </div>
            <div>
              <label className="label">Descripción (opcional)</label>
              <input className="input" placeholder="Descripción breve..."
                value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Fecha de inicio *</label>
                <input type="date" className="input" required
                  value={form.fechaInicio} onChange={e => setForm(f => ({ ...f, fechaInicio: e.target.value }))} />
              </div>
              <div>
                <label className="label">Fecha de fin *</label>
                <input type="date" className="input" required
                  value={form.fechaFin} onChange={e => setForm(f => ({ ...f, fechaFin: e.target.value }))} />
              </div>
            </div>
            <button type="submit" disabled={loading} className="btn-primary">
              {loading ? 'Creando...' : 'Crear Evento'}
            </button>
          </form>
        </div>
      )}

      {/* Lista */}
      <div className="space-y-3">
        {eventos.map(ev => (
          <div key={ev.id} className="card p-5 flex items-center justify-between hover:shadow-md transition-shadow">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <p className="font-semibold text-gray-900">{ev.nombre}</p>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ESTADO_STYLES[ev.estado] ?? ''}`}>
                  {ev.estado}
                </span>
              </div>
              {ev.descripcion && <p className="text-gray-500 text-sm">{ev.descripcion}</p>}
              <p className="text-gray-400 text-xs mt-1">
                {formatDate(ev.fechaInicio)} – {formatDate(ev.fechaFin)}
              </p>
            </div>
            <div className="flex items-center gap-4 ml-4">
              <div className="text-right">
                <p className="text-2xl font-bold text-gray-900">{ev._count.asignaciones}</p>
                <p className="text-gray-400 text-xs">aplicante(s)</p>
              </div>
              <button
                onClick={() => openEdit(ev)}
                className="p-2 rounded-xl border border-gray-200 hover:border-gray-400 hover:bg-gray-50 transition-all text-gray-500 hover:text-gray-900"
                title="Editar evento"
              >
                ✏️
              </button>
            </div>
          </div>
        ))}
        {eventos.length === 0 && (
          <div className="card p-8 text-center">
            <p className="text-3xl mb-3">🎪</p>
            <p className="text-gray-700 font-semibold">No hay eventos aún</p>
            <p className="text-gray-400 text-sm mt-1">Crea el primero para comenzar.</p>
          </div>
        )}
      </div>

      {/* Modal de edición */}
      {editing && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="card p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-gray-900">Editar Evento</h2>
              <button onClick={() => setEditing(null)} className="text-gray-400 hover:text-gray-700 text-xl leading-none">✕</button>
            </div>

            <form onSubmit={handleEdit} className="space-y-4">
              <div>
                <label className="label">Nombre *</label>
                <input className="input" required
                  value={editForm.nombre}
                  onChange={e => setEditForm(f => ({ ...f, nombre: e.target.value }))} />
              </div>
              <div>
                <label className="label">Descripción</label>
                <input className="input" placeholder="Opcional..."
                  value={editForm.descripcion}
                  onChange={e => setEditForm(f => ({ ...f, descripcion: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Fecha de inicio *</label>
                  <input type="date" className="input" required
                    value={editForm.fechaInicio}
                    onChange={e => setEditForm(f => ({ ...f, fechaInicio: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Fecha de fin *</label>
                  <input type="date" className="input" required
                    value={editForm.fechaFin}
                    onChange={e => setEditForm(f => ({ ...f, fechaFin: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="label">Estado</label>
                <div className="flex gap-2">
                  {ESTADO_OPTS.map(op => (
                    <button key={op} type="button"
                      onClick={() => setEditForm(f => ({ ...f, estado: op }))}
                      className={`flex-1 py-2 rounded-xl border-2 text-xs font-semibold transition-all ${
                        editForm.estado === op
                          ? 'border-gray-900 bg-gray-50 text-gray-900'
                          : 'border-gray-200 text-gray-500 hover:border-gray-300'
                      }`}>
                      {op}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setEditing(null)} className="btn-ghost flex-1">Cancelar</button>
                <button type="submit" disabled={loading} className="btn-primary flex-1">
                  {loading ? 'Guardando...' : 'Guardar cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

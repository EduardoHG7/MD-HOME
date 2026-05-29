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

export default function EventosPage() {
  const [eventos, setEventos] = useState<Evento[]>([])
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({ nombre: '', descripcion: '', fechaInicio: '', fechaFin: '' })

  useEffect(() => {
    fetch('/api/eventos').then(r => r.json()).then(setEventos)
  }, [])

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

      <div className="space-y-3">
        {eventos.map(ev => (
          <div key={ev.id} className="card p-5 flex items-center justify-between hover:shadow-md transition-shadow">
            <div>
              <p className="font-semibold text-gray-900">{ev.nombre}</p>
              {ev.descripcion && <p className="text-gray-500 text-sm">{ev.descripcion}</p>}
              <p className="text-gray-400 text-xs mt-1">
                {formatDate(ev.fechaInicio)} – {formatDate(ev.fechaFin)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-brand-700">{ev._count.asignaciones}</p>
              <p className="text-gray-400 text-xs">aplicante(s)</p>
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
    </div>
  )
}

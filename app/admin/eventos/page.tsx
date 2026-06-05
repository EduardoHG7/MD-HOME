'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatDate } from '@/lib/utils'

interface Venue  { id: string; nombre: string; direccion: string | null }
interface Evento {
  id: string; nombre: string; descripcion: string | null
  fechaInicio: string; fechaFin: string; estado: string
  tipoEvento: string | null; venueId: string | null
  tieneSocio: boolean; nombreSocio: string | null
  venue: Venue | null
  _count: { asignaciones: number }
}

const TIPOS_EVENTO = [
  { value: 'PROPIO',       label: 'Propio (concierto/festival)' },
  { value: 'CONTRATADO',   label: 'Contratado (licitación/cliente)' },
  { value: 'COPRODUCCION', label: 'Co-producción con socio' },
]

const TIPO_LABELS: Record<string, string> = {
  PROPIO:       'Propio',
  CONTRATADO:   'Contratado',
  COPRODUCCION: 'Co-producción',
}

const ESTADO_STYLES: Record<string, string> = {
  ACTIVO:     'bg-green-100 text-green-700',
  COMPLETADO: 'bg-gray-100 text-gray-600',
  CANCELADO:  'bg-red-100 text-red-600',
}

function toInputDate(iso: string) { return iso.split('T')[0] }

type FormState = {
  nombre: string; descripcion: string; fechaInicio: string; fechaFin: string
  tipoEvento: string; venueId: string; tieneSocio: boolean; nombreSocio: string
  estado?: string
}

const emptyForm: FormState = {
  nombre: '', descripcion: '', fechaInicio: '', fechaFin: '',
  tipoEvento: '', venueId: '', tieneSocio: false, nombreSocio: '',
}

// ── Componente fuera del padre para evitar re-mount en cada keystroke ──
function EventoForm({ values, venues, onChange, showEstado = false }: {
  values: FormState
  venues: Venue[]
  onChange: (v: Partial<FormState>) => void
  showEstado?: boolean
}) {
  return (
    <div className="space-y-4">
      <div>
        <label className="label">Nombre del evento *</label>
        <input className="input" required value={values.nombre}
          onChange={e => onChange({ nombre: e.target.value })} />
      </div>
      <div>
        <label className="label">Descripción (opcional)</label>
        <input className="input" placeholder="Descripción breve..."
          value={values.descripcion} onChange={e => onChange({ descripcion: e.target.value })} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Fecha de inicio *</label>
          <input type="date" className="input" required value={values.fechaInicio}
            onChange={e => onChange({ fechaInicio: e.target.value })} />
        </div>
        <div>
          <label className="label">Fecha de fin *</label>
          <input type="date" className="input" required value={values.fechaFin}
            onChange={e => onChange({ fechaFin: e.target.value })} />
        </div>
      </div>

      {/* Tipo de evento */}
      <div>
        <label className="label">Tipo de evento</label>
        <div className="grid grid-cols-3 gap-2">
          {TIPOS_EVENTO.map(t => (
            <button key={t.value} type="button"
              onClick={() => onChange({ tipoEvento: t.value })}
              className={`p-2.5 rounded-xl border-2 text-xs font-medium text-center transition-all ${
                values.tipoEvento === t.value
                  ? 'border-gray-900 bg-gray-50 text-gray-900'
                  : 'border-gray-200 text-gray-500 hover:border-gray-300'
              }`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Venue */}
      <div>
        <label className="label">Venue</label>
        <select className="input" value={values.venueId} onChange={e => onChange({ venueId: e.target.value })}>
          <option value="">Sin venue asignado</option>
          {venues.map(v => (
            <option key={v.id} value={v.id}>
              {v.nombre}{v.direccion ? ` — ${v.direccion}` : ''}
            </option>
          ))}
        </select>
      </div>

      {/* Socio externo */}
      <div>
        <label className="label">¿Tiene socio externo?</label>
        <div className="flex gap-3">
          {[{ val: true, label: '✅ Sí' }, { val: false, label: '❌ No' }].map(op => (
            <button key={String(op.val)} type="button"
              onClick={() => onChange({ tieneSocio: op.val, ...(!op.val && { nombreSocio: '' }) })}
              className={`flex-1 py-2.5 rounded-xl border-2 text-sm font-medium transition-all ${
                values.tieneSocio === op.val
                  ? 'border-gray-900 bg-gray-50 text-gray-900'
                  : 'border-gray-200 text-gray-500 hover:border-gray-300'
              }`}>
              {op.label}
            </button>
          ))}
        </div>
        {values.tieneSocio && (
          <input className="input mt-2" placeholder="Nombre del socio externo..."
            value={values.nombreSocio} onChange={e => onChange({ nombreSocio: e.target.value })} />
        )}
      </div>

      {/* Estado (solo en edición) */}
      {showEstado && (
        <div>
          <label className="label">Estado</label>
          <div className="flex gap-2">
            {['ACTIVO', 'COMPLETADO', 'CANCELADO'].map(op => (
              <button key={op} type="button"
                onClick={() => onChange({ estado: op })}
                className={`flex-1 py-2 rounded-xl border-2 text-xs font-semibold transition-all ${
                  values.estado === op
                    ? 'border-gray-900 bg-gray-50 text-gray-900'
                    : 'border-gray-200 text-gray-500 hover:border-gray-300'
                }`}>
                {op}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Página principal ──
export default function EventosPage() {
  const router = useRouter()
  const [eventos,  setEventos]  = useState<Evento[]>([])
  const [venues,   setVenues]   = useState<Venue[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editing,  setEditing]  = useState<Evento | null>(null)
  const [loading,  setLoading]  = useState(false)
  const [form,     setForm]     = useState<FormState>(emptyForm)
  const [editForm, setEditForm] = useState<FormState>({ ...emptyForm, estado: '' })

  useEffect(() => {
    fetch('/api/eventos').then(r => r.json()).then(setEventos)
    fetch('/api/venues').then(r => r.json()).then(d => setVenues(Array.isArray(d) ? d : []))
  }, [])

  function openEdit(ev: Evento) {
    setEditing(ev)
    setEditForm({
      nombre:      ev.nombre,
      descripcion: ev.descripcion ?? '',
      fechaInicio: toInputDate(ev.fechaInicio),
      fechaFin:    toInputDate(ev.fechaFin),
      estado:      ev.estado,
      tipoEvento:  ev.tipoEvento ?? '',
      venueId:     ev.venueId ?? '',
      tieneSocio:  ev.tieneSocio,
      nombreSocio: ev.nombreSocio ?? '',
    })
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const res = await fetch('/api/eventos', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    if (res.ok) {
      const ev = await res.json()
      setEventos(prev => [{ ...ev, _count: { asignaciones: 0 } }, ...prev])
      setForm(emptyForm)
      setShowForm(false)
    }
    setLoading(false)
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editing) return
    setLoading(true)
    const res = await fetch(`/api/eventos/${editing.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editForm),
    })
    if (res.ok) {
      const updated = await res.json()
      setEventos(prev => prev.map(ev => ev.id === updated.id ? updated : ev))
      setEditing(null)
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

      {/* Formulario crear */}
      {showForm && (
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Crear Evento</h2>
          <form onSubmit={handleCreate} className="space-y-4">
            <EventoForm values={form} venues={venues} onChange={v => setForm(f => ({ ...f, ...v }))} />
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
              <div className="flex items-center gap-2 flex-wrap mb-0.5">
                <p className="font-semibold text-gray-900">{ev.nombre}</p>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ESTADO_STYLES[ev.estado] ?? ''}`}>
                  {ev.estado}
                </span>
                {ev.tipoEvento && (
                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                    {TIPO_LABELS[ev.tipoEvento] ?? ev.tipoEvento}
                  </span>
                )}
                {ev.tieneSocio && (
                  <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium">
                    🤝 {ev.nombreSocio ?? 'Socio externo'}
                  </span>
                )}
              </div>
              {ev.descripcion && <p className="text-gray-500 text-sm">{ev.descripcion}</p>}
              <div className="flex items-center gap-3 text-gray-400 text-xs mt-1">
                <span>📅 {formatDate(ev.fechaInicio)} – {formatDate(ev.fechaFin)}</span>
                {ev.venue && <span>📍 {ev.venue.nombre}</span>}
              </div>
            </div>
            <div className="flex items-center gap-4 ml-4">
              <div className="text-right">
                <p className="text-2xl font-bold text-gray-900">{ev._count.asignaciones}</p>
                <p className="text-gray-400 text-xs">aplicante(s)</p>
              </div>
              <button onClick={() => router.push(`/admin/eventos/${ev.id}/presupuesto`)}
                className="p-2 rounded-xl border border-amber-200 hover:border-amber-400 hover:bg-amber-50 transition-all text-amber-600 text-xs font-medium px-3"
                title="Ver presupuesto">💰 Presupuesto</button>
              <button onClick={() => openEdit(ev)}
                className="p-2 rounded-xl border border-gray-200 hover:border-gray-400 hover:bg-gray-50 transition-all text-gray-500"
                title="Editar evento">✏️</button>
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

      {/* Modal edición */}
      {editing && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="card p-6 w-full max-w-lg shadow-2xl my-4">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-gray-900">Editar Evento</h2>
              <button onClick={() => setEditing(null)} className="text-gray-400 hover:text-gray-700 text-xl">✕</button>
            </div>
            <form onSubmit={handleEdit} className="space-y-4">
              <EventoForm values={editForm} venues={venues} onChange={v => setEditForm(f => ({ ...f, ...v }))} showEstado />
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

'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatDate } from '@/lib/utils'
import { DocumentosEvento } from '@/components/DocumentosEvento'

interface Venue  { id: string; nombre: string; direccion: string | null }
interface Usuario { id: string; name: string | null; email: string }
interface Evento {
  id: string; nombre: string; descripcion: string | null
  fechaInicio: string; fechaFin: string; estado: string
  tipoEvento: string | null; venueId: string | null
  tieneSocio: boolean; nombreSocio: string | null
  montajeInicio: string | null; desmontajeFin: string | null
  docsResponsableId: string | null
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

const ESTADOS = ['POR_INICIAR', 'ACTIVO', 'COMPLETADO', 'CANCELADO']

const ESTADO_LABELS: Record<string, string> = {
  POR_INICIAR: 'Por iniciar',
  ACTIVO:      'Activo',
  COMPLETADO:  'Completado',
  CANCELADO:   'Cancelado',
}

const ESTADO_STYLES: Record<string, string> = {
  POR_INICIAR: 'bg-blue-100 text-blue-700',
  ACTIVO:      'bg-green-100 text-green-700',
  COMPLETADO:  'bg-gray-100 text-gray-600',
  CANCELADO:   'bg-red-100 text-red-600',
}

function toInputDate(iso: string) { return iso.split('T')[0] }

type FormState = {
  nombre: string; descripcion: string; fechaInicio: string; fechaFin: string
  tipoEvento: string; venueId: string; tieneSocio: boolean; nombreSocio: string
  estado: string; montajeInicio: string; desmontajeFin: string
  docsResponsableId: string
}

const emptyForm: FormState = {
  nombre: '', descripcion: '', fechaInicio: '', fechaFin: '',
  tipoEvento: '', venueId: '', tieneSocio: false, nombreSocio: '',
  estado: 'ACTIVO', montajeInicio: '', desmontajeFin: '',
  docsResponsableId: '',
}

// ── Componente fuera del padre para evitar re-mount en cada keystroke ──
function EventoForm({ values, venues, usuarios, onChange }: {
  values: FormState
  venues: Venue[]
  usuarios: Usuario[]
  onChange: (v: Partial<FormState>) => void
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

      {/* Estado */}
      <div>
        <label className="label">Estado</label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {ESTADOS.map(op => (
            <button key={op} type="button"
              onClick={() => onChange({ estado: op })}
              className={`py-2 px-2 rounded-xl border-2 text-xs font-semibold transition-all ${
                values.estado === op
                  ? 'border-gray-900 bg-gray-50 text-gray-900'
                  : 'border-gray-200 text-gray-500 hover:border-gray-300'
              }`}>
              {ESTADO_LABELS[op]}
            </button>
          ))}
        </div>
      </div>

      {/* Montaje / desmontaje — habilitado con estado Por iniciar */}
      {values.estado === 'POR_INICIAR' && (
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 space-y-3">
          <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Montaje y desmontaje</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Inicio de montaje</label>
              <input type="date" className="input" value={values.montajeInicio}
                max={values.fechaInicio || undefined}
                onChange={e => onChange({ montajeInicio: e.target.value })} />
              <p className="text-xs text-gray-400 mt-1">🔴 Días de montaje en rojo</p>
            </div>
            <div>
              <label className="label">Fin de desmontaje</label>
              <input type="date" className="input" value={values.desmontajeFin}
                min={values.fechaFin || undefined}
                onChange={e => onChange({ desmontajeFin: e.target.value })} />
              <p className="text-xs text-gray-400 mt-1">🟠 Días de desmontaje en naranja</p>
            </div>
          </div>
        </div>
      )}

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

      {/* Responsable de documentación */}
      <div>
        <label className="label">📁 Responsable de documentación</label>
        <p className="text-gray-400 text-xs mb-1">Esta persona podrá subir contrato, seguro, fianza y otros documentos legales del evento.</p>
        <select className="input" value={values.docsResponsableId} onChange={e => onChange({ docsResponsableId: e.target.value })}>
          <option value="">Sin responsable asignado</option>
          {usuarios.map(u => (
            <option key={u.id} value={u.id}>{u.name ?? u.email} — {u.email}</option>
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
    </div>
  )
}

// ── Página principal ──
export default function EventosPage() {
  const router = useRouter()
  const [eventos,  setEventos]  = useState<Evento[]>([])
  const [venues,   setVenues]   = useState<Venue[]>([])
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editing,  setEditing]  = useState<Evento | null>(null)
  const [verDocs,  setVerDocs]  = useState<Evento | null>(null)
  const [loading,  setLoading]  = useState(false)
  const [form,     setForm]     = useState<FormState>(emptyForm)
  const [editForm, setEditForm] = useState<FormState>(emptyForm)

  useEffect(() => {
    fetch('/api/eventos').then(r => r.json()).then(setEventos)
    fetch('/api/venues').then(r => r.json()).then(d => setVenues(Array.isArray(d) ? d : []))
    fetch('/api/usuarios/lista').then(r => r.json()).then(d => setUsuarios(Array.isArray(d) ? d : []))
  }, [])

  function openEdit(ev: Evento) {
    setEditing(ev)
    setEditForm({
      nombre:        ev.nombre,
      descripcion:   ev.descripcion ?? '',
      fechaInicio:   toInputDate(ev.fechaInicio),
      fechaFin:      toInputDate(ev.fechaFin),
      estado:        ev.estado,
      tipoEvento:    ev.tipoEvento ?? '',
      venueId:       ev.venueId ?? '',
      tieneSocio:    ev.tieneSocio,
      nombreSocio:   ev.nombreSocio ?? '',
      montajeInicio: ev.montajeInicio ? toInputDate(ev.montajeInicio) : '',
      desmontajeFin: ev.desmontajeFin ? toInputDate(ev.desmontajeFin) : '',
      docsResponsableId: ev.docsResponsableId ?? '',
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
            <EventoForm values={form} venues={venues} usuarios={usuarios} onChange={v => setForm(f => ({ ...f, ...v }))} />
            <button type="submit" disabled={loading} className="btn-primary">
              {loading ? 'Creando...' : 'Crear Evento'}
            </button>
          </form>
        </div>
      )}

      {/* Lista */}
      <div className="space-y-3">
        {eventos.map(ev => (
          <div key={ev.id} className="card p-5 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-0.5">
                  <p className="font-semibold text-gray-900">{ev.nombre}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ESTADO_STYLES[ev.estado] ?? ''}`}>
                    {ESTADO_LABELS[ev.estado] ?? ev.estado}
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
                <div className="flex flex-wrap items-center gap-3 text-gray-400 text-xs mt-1">
                  <span>📅 {formatDate(ev.fechaInicio)} – {formatDate(ev.fechaFin)}</span>
                  {ev.venue && <span>📍 {ev.venue.nombre}</span>}
                  {ev.montajeInicio && <span className="text-red-500">🔴 Montaje: {formatDate(ev.montajeInicio)}</span>}
                  {ev.desmontajeFin && <span className="text-orange-500">🟠 Desmontaje hasta: {formatDate(ev.desmontajeFin)}</span>}
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className="text-2xl font-bold text-gray-900">{ev._count.asignaciones}</p>
                <p className="text-gray-400 text-xs">aplicante(s)</p>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              <button onClick={() => router.push(`/admin/eventos/${ev.id}/presupuesto`)}
                className="p-2 rounded-xl border border-amber-200 hover:border-amber-400 hover:bg-amber-50 transition-all text-amber-600 text-xs font-medium px-3"
                title="Ver presupuesto">💰 Presupuesto</button>
              <button onClick={() => setVerDocs(ev)}
                className="p-2 rounded-xl border border-blue-200 hover:border-blue-400 hover:bg-blue-50 transition-all text-blue-600 text-xs font-medium px-3"
                title="Documentos legales">📁 Documentos</button>
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

      {/* Modal documentos */}
      {verDocs && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="card p-6 w-full max-w-lg shadow-2xl my-4">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-lg font-bold text-gray-900">📁 Documentos del evento</h2>
              <button onClick={() => setVerDocs(null)} className="text-gray-400 hover:text-gray-700 text-xl">✕</button>
            </div>
            <p className="text-gray-500 text-sm mb-4">{verDocs.nombre}</p>
            {verDocs.docsResponsableId ? (
              <p className="text-xs text-gray-400 mb-3">
                Responsable: {usuarios.find(u => u.id === verDocs.docsResponsableId)?.name
                  ?? usuarios.find(u => u.id === verDocs.docsResponsableId)?.email
                  ?? '(usuario)'}
              </p>
            ) : (
              <p className="text-xs text-amber-600 mb-3">⚠️ Sin responsable asignado — edita el evento para asignar uno.</p>
            )}
            <DocumentosEvento eventoId={verDocs.id} puedeSubir={true} />
          </div>
        </div>
      )}

      {/* Modal edición */}
      {editing && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="card p-6 w-full max-w-lg shadow-2xl my-4">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-gray-900">Editar Evento</h2>
              <button onClick={() => setEditing(null)} className="text-gray-400 hover:text-gray-700 text-xl">✕</button>
            </div>
            <form onSubmit={handleEdit} className="space-y-4">
              <EventoForm values={editForm} venues={venues} usuarios={usuarios} onChange={v => setEditForm(f => ({ ...f, ...v }))} />
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

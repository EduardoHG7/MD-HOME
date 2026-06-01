'use client'

import { useState, useEffect } from 'react'
import { formatDate, formatCurrency, TARIFA_LABELS, ESTADO_COLORS, ESTADO_SOLICITUD_LABELS } from '@/lib/utils'

interface Evento   { id: string; nombre: string; fechaInicio: string; fechaFin: string }
interface Puesto   { id: string; nombre: string }
interface Tarifa   { id: string; tipo: string; precioPorDia: number }
interface Solicitud {
  id: string
  numPersonas: number
  funcion: string
  estado: string
  costoTotal: number | null
  notaAdmin: string | null
  createdAt: string
  evento: Evento
  tarifa: Tarifa | null
}

export default function SolicitarPage() {
  const [eventos,     setEventos]     = useState<Evento[]>([])
  const [puestos,     setPuestos]     = useState<Puesto[]>([])
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([])
  const [showForm,    setShowForm]    = useState(false)
  const [loading,     setLoading]     = useState(false)
  const [success,     setSuccess]     = useState(false)
  const [error,       setError]       = useState('')

  const [form, setForm] = useState({
    eventoId: '', numPersonas: 1, funcion: '', funcionCustom: '',
  })

  useEffect(() => {
    Promise.all([
      fetch('/api/eventos').then(r => r.json()),
      fetch('/api/puestos').then(r => r.json()),
      fetch('/api/solicitudes').then(r => r.json()),
    ]).then(([ev, pu, sol]) => {
      setEventos(Array.isArray(ev) ? ev : [])
      setPuestos(Array.isArray(pu) ? pu : [])
      setSolicitudes(Array.isArray(sol) ? sol : [])
    })
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!form.eventoId) { setError('Selecciona un evento.'); return }
    const funcion = form.funcion === 'OTRO' ? form.funcionCustom.trim() : form.funcion
    if (!funcion) { setError('Indica la función del personal.'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/solicitudes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventoId: form.eventoId, numPersonas: form.numPersonas, funcion }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Error al enviar.'); return }
      setSolicitudes(prev => [data, ...prev])
      setSuccess(true)
      setForm({ eventoId: '', numPersonas: 1, funcion: '', funcionCustom: '' })
      setShowForm(false)
      setTimeout(() => setSuccess(false), 5000)
    } catch { setError('Error de conexión.') }
    finally { setLoading(false) }
  }

  const pendientes = solicitudes.filter(s => s.estado === 'PENDIENTE').length
  const aprobadas  = solicitudes.filter(s => s.estado === 'APROBADA').length

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Solicitudes de Personal</h1>
          <p className="text-gray-500 mt-1">Gestiona tus solicitudes de personal eventual</p>
        </div>
        <button
          onClick={() => { setShowForm(v => !v); setError('') }}
          className="btn-primary"
        >
          {showForm ? '✕ Cancelar' : '+ Nueva Solicitud'}
        </button>
      </div>

      {/* Mensaje de éxito */}
      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 rounded-xl px-4 py-3 text-sm">
          ✓ Solicitud enviada. El administrador la revisará y asignará la tarifa correspondiente.
        </div>
      )}

      {/* Formulario (toggle) */}
      {showForm && (
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-5">Nueva Solicitud</h2>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl px-4 py-3 mb-4 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Evento *</label>
              <select className="input" value={form.eventoId}
                onChange={e => setForm(f => ({ ...f, eventoId: e.target.value }))} required>
                <option value="">Seleccionar evento...</option>
                {eventos.map(ev => (
                  <option key={ev.id} value={ev.id}>
                    {ev.nombre} — {formatDate(ev.fechaInicio)}
                  </option>
                ))}
              </select>
              {eventos.length === 0 && (
                <p className="text-gray-400 text-xs mt-1">No hay eventos activos. Contacta al administrador.</p>
              )}
            </div>

            <div>
              <label className="label">Cantidad de personas *</label>
              <input type="number" min={1} max={500} className="input" value={form.numPersonas}
                onChange={e => setForm(f => ({ ...f, numPersonas: parseInt(e.target.value) || 1 }))} required />
            </div>

            <div>
              <label className="label">Función a desempeñar *</label>
              <select className="input" value={form.funcion}
                onChange={e => setForm(f => ({ ...f, funcion: e.target.value }))} required>
                <option value="">Seleccionar función...</option>
                {puestos.map(p => (
                  <option key={p.id} value={p.nombre}>{p.nombre}</option>
                ))}
                <option value="OTRO">Otro (especificar)</option>
              </select>
              {puestos.length === 0 && (
                <p className="text-gray-400 text-xs mt-1">No hay funciones cargadas aún.</p>
              )}
              {form.funcion === 'OTRO' && (
                <input className="input mt-2" placeholder="Describe la función..."
                  value={form.funcionCustom}
                  onChange={e => setForm(f => ({ ...f, funcionCustom: e.target.value }))} />
              )}
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700">
              💡 El administrador asignará la tarifa y el costo total al revisar tu solicitud.
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? 'Enviando...' : 'Enviar Solicitud'}
            </button>
          </form>
        </div>
      )}

      {/* Resumen de estados */}
      {solicitudes.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <div className="card p-4 text-center">
            <p className="text-3xl font-bold text-gray-900">{solicitudes.length}</p>
            <p className="text-gray-500 text-sm mt-1">Total</p>
          </div>
          <div className="card p-4 text-center">
            <p className="text-3xl font-bold text-yellow-500">{pendientes}</p>
            <p className="text-gray-500 text-sm mt-1">Pendientes</p>
          </div>
          <div className="card p-4 text-center">
            <p className="text-3xl font-bold text-green-500">{aprobadas}</p>
            <p className="text-gray-500 text-sm mt-1">Aprobadas</p>
          </div>
        </div>
      )}

      {/* Lista de solicitudes */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Mis Solicitudes</h2>

        {solicitudes.length === 0 ? (
          <div className="card p-10 text-center">
            <p className="text-4xl mb-3">📋</p>
            <p className="text-gray-700 font-semibold">No tienes solicitudes aún</p>
            <p className="text-gray-400 text-sm mt-1">Haz click en &quot;+ Nueva Solicitud&quot; para comenzar</p>
          </div>
        ) : (
          <div className="space-y-3">
            {solicitudes.map(s => (
              <div key={s.id} className="card p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-semibold text-gray-900 truncate">{s.evento.nombre}</p>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500">
                      <span>👤 {s.numPersonas} persona(s)</span>
                      <span>🔧 {s.funcion}</span>
                      <span>📅 {formatDate(s.createdAt)}</span>
                    </div>
                    <p className="text-gray-400 text-xs mt-1">
                      Evento: {formatDate(s.evento.fechaInicio)} – {formatDate(s.evento.fechaFin)}
                    </p>
                  </div>
                  <span className={`badge shrink-0 ${ESTADO_COLORS[s.estado]}`}>
                    {ESTADO_SOLICITUD_LABELS[s.estado]}
                  </span>
                </div>

                {/* Info adicional si fue aprobada */}
                {s.estado === 'APROBADA' && (
                  <div className="mt-3 pt-3 border-t border-gray-100 flex flex-wrap gap-4">
                    {s.tarifa && (
                      <div>
                        <p className="text-xs text-gray-400">Tarifa asignada</p>
                        <p className="text-sm font-semibold text-gray-700">{TARIFA_LABELS[s.tarifa.tipo]} · {formatCurrency(s.tarifa.precioPorDia)}/día</p>
                      </div>
                    )}
                    {s.costoTotal && (
                      <div>
                        <p className="text-xs text-gray-400">Costo total aprobado</p>
                        <p className="text-sm font-bold text-green-600">{formatCurrency(s.costoTotal)}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Nota del admin */}
                {s.notaAdmin && (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <p className="text-xs text-gray-400 mb-1">Nota del administrador</p>
                    <p className="text-sm text-gray-600 italic">&quot;{s.notaAdmin}&quot;</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

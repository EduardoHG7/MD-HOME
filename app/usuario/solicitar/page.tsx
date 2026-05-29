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
  createdAt: string
  evento: Evento
  tarifa: Tarifa | null
}

export default function SolicitarPage() {
  const [eventos,     setEventos]     = useState<Evento[]>([])
  const [puestos,     setPuestos]     = useState<Puesto[]>([])
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([])
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
      setEventos(ev)
      setPuestos(pu)
      setSolicitudes(sol)
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
      setTimeout(() => setSuccess(false), 4000)
    } catch { setError('Error de conexión.') }
    finally { setLoading(false) }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Solicitar Personal</h1>
        <p className="text-gray-500 mt-1">Completa el formulario para solicitar personal eventual.</p>
      </div>

      <div className="card p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-5">Nueva Solicitud</h2>

        {success && (
          <div className="bg-green-50 border border-green-200 text-green-700 rounded-xl px-4 py-3 mb-4 text-sm">
            ✓ Solicitud enviada. El administrador la revisará y asignará la tarifa correspondiente.
          </div>
        )}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl px-4 py-3 mb-4 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Evento */}
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

          {/* Cantidad */}
          <div>
            <label className="label">Cantidad de personas *</label>
            <input type="number" min={1} max={500} className="input" value={form.numPersonas}
              onChange={e => setForm(f => ({ ...f, numPersonas: parseInt(e.target.value) || 1 }))} required />
          </div>

          {/* Función */}
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
              <p className="text-gray-400 text-xs mt-1">No hay funciones disponibles. Contacta al administrador.</p>
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

      {/* Mis solicitudes */}
      {solicitudes.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Mis Solicitudes</h2>
          <div className="space-y-3">
            {solicitudes.map(s => (
              <div key={s.id} className="card p-4 flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 truncate">{s.evento.nombre}</p>
                  <p className="text-gray-500 text-sm">{s.funcion} · {s.numPersonas} persona(s)</p>
                  <p className="text-gray-400 text-xs mt-1">{formatDate(s.createdAt)}</p>
                  {s.tarifa && (
                    <p className="text-gray-500 text-xs mt-1">Tarifa: {TARIFA_LABELS[s.tarifa.tipo]}</p>
                  )}
                  {s.costoTotal && (
                    <p className="text-amber-600 text-sm font-semibold mt-1">
                      Total aprobado: {formatCurrency(s.costoTotal)}
                    </p>
                  )}
                </div>
                <span className={`badge shrink-0 ${ESTADO_COLORS[s.estado]}`}>
                  {ESTADO_SOLICITUD_LABELS[s.estado]}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

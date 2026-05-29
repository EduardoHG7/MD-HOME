'use client'

import { useState, useEffect } from 'react'
import { formatDate, formatCurrency, TARIFA_LABELS, ESTADO_COLORS, ESTADO_SOLICITUD_LABELS } from '@/lib/utils'

interface Evento { id: string; nombre: string; fechaInicio: string; fechaFin: string }
interface Tarifa { id: string; tipo: string; precioPorDia: number }
interface Solicitud {
  id: string
  numPersonas: number
  funcion: string
  estado: string
  costoTotal: number | null
  createdAt: string
  evento: Evento
  tarifa: Tarifa
}

const FUNCIONES = [
  'Mesero(a)', 'Bartender', 'Anfitrión(a)', 'Seguridad', 'Limpieza',
  'Coordinador(a)', 'Técnico de sonido', 'Iluminación', 'Atención al cliente', 'Otro',
]

export default function SolicitarPage() {
  const [eventos, setEventos]       = useState<Evento[]>([])
  const [tarifas, setTarifas]       = useState<Tarifa[]>([])
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([])
  const [loading, setLoading]       = useState(false)
  const [success, setSuccess]       = useState(false)
  const [error, setError]           = useState('')

  const [form, setForm] = useState({
    eventoId: '', numPersonas: 1, funcion: '', funcionCustom: '', tipoTarifa: '',
  })

  useEffect(() => {
    Promise.all([
      fetch('/api/eventos').then(r => r.json()),
      fetch('/api/tarifas').then(r => r.json()),
      fetch('/api/solicitudes').then(r => r.json()),
    ]).then(([ev, tar, sol]) => {
      setEventos(ev)
      setTarifas(tar)
      setSolicitudes(sol)
      if (tar.length > 0) setForm(f => ({ ...f, tipoTarifa: tar[0].tipo }))
    })
  }, [])

  const selectedTarifa = tarifas.find(t => t.tipo === form.tipoTarifa)
  const estimado = selectedTarifa ? selectedTarifa.precioPorDia * form.numPersonas : 0

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!form.eventoId || !form.tipoTarifa) { setError('Selecciona un evento y una tarifa.'); return }
    const funcion = form.funcion === 'Otro' ? form.funcionCustom : form.funcion
    if (!funcion) { setError('Indica la función del personal.'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/solicitudes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventoId: form.eventoId, numPersonas: form.numPersonas, funcion, tipoTarifa: form.tipoTarifa }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Error al enviar.'); return }
      setSolicitudes(prev => [data, ...prev])
      setSuccess(true)
      setForm(f => ({ ...f, eventoId: '', numPersonas: 1, funcion: '', funcionCustom: '' }))
      setTimeout(() => setSuccess(false), 4000)
    } catch { setError('Error de conexión.') }
    finally { setLoading(false) }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Solicitar Personal</h1>
        <p className="text-gray-500 mt-1">Completa el formulario para solicitar personal eventual para tu evento.</p>
      </div>

      <div className="card p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-5">Nueva Solicitud</h2>

        {success && (
          <div className="bg-green-50 border border-green-200 text-green-700 rounded-xl px-4 py-3 mb-4 text-sm">
            ✓ Solicitud enviada correctamente. El administrador la revisará pronto.
          </div>
        )}
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
              <p className="text-gray-400 text-xs mt-1">No hay eventos activos. El administrador debe crear un evento primero.</p>
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
              {FUNCIONES.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
            {form.funcion === 'Otro' && (
              <input className="input mt-2" placeholder="Describe la función..."
                value={form.funcionCustom}
                onChange={e => setForm(f => ({ ...f, funcionCustom: e.target.value }))} />
            )}
          </div>

          <div>
            <label className="label">Tarifa *</label>
            <div className="grid grid-cols-3 gap-3">
              {tarifas.map(t => (
                <button key={t.tipo} type="button"
                  onClick={() => setForm(f => ({ ...f, tipoTarifa: t.tipo }))}
                  className={`p-3 rounded-xl border-2 text-left transition-all ${
                    form.tipoTarifa === t.tipo
                      ? 'border-gray-900 bg-gray-50 shadow-sm'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{TARIFA_LABELS[t.tipo]}</p>
                  <p className="text-xl font-bold text-gray-900 mt-0.5">{formatCurrency(t.precioPorDia)}</p>
                  <p className="text-xs text-gray-400">por día</p>
                </button>
              ))}
            </div>
          </div>

          {estimado > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex justify-between items-center">
              <div>
                <p className="text-amber-700 text-xs font-semibold uppercase tracking-wide">Estimado por día</p>
                <p className="text-gray-700 text-sm">{form.numPersonas} persona(s) × {formatCurrency(selectedTarifa!.precioPorDia)}</p>
              </div>
              <p className="text-amber-600 text-2xl font-bold">{formatCurrency(estimado)}</p>
            </div>
          )}

          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? 'Enviando...' : 'Enviar Solicitud'}
          </button>
        </form>
      </div>

      {solicitudes.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Mis Solicitudes</h2>
          <div className="space-y-3">
            {solicitudes.map(s => (
              <div key={s.id} className="card p-4 flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 truncate">{s.evento.nombre}</p>
                  <p className="text-gray-500 text-sm">{s.funcion} · {s.numPersonas} persona(s)</p>
                  <p className="text-gray-400 text-xs mt-1">
                    {TARIFA_LABELS[s.tarifa.tipo]} · {formatDate(s.createdAt)}
                  </p>
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

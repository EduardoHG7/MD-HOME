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
  const [eventos, setEventos] = useState<Evento[]>([])
  const [tarifas, setTarifas] = useState<Tarifa[]>([])
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([])
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    eventoId: '',
    numPersonas: 1,
    funcion: '',
    funcionCustom: '',
    tipoTarifa: '',
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
    if (!form.eventoId || !form.tipoTarifa) {
      setError('Selecciona un evento y una tarifa.')
      return
    }
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
    } catch {
      setError('Error de conexión.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Solicitar Personal</h1>
        <p className="text-brand-400 mt-1">Completa el formulario para solicitar personal eventual para tu evento.</p>
      </div>

      {/* Form */}
      <div className="card p-6">
        <h2 className="text-lg font-semibold text-white mb-5">Nueva Solicitud</h2>

        {success && (
          <div className="bg-green-500/10 border border-green-500/30 text-green-400 rounded-xl px-4 py-3 mb-4 text-sm">
            ✓ Solicitud enviada correctamente. El administrador la revisará pronto.
          </div>
        )}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl px-4 py-3 mb-4 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Evento *</label>
            <select className="input" value={form.eventoId} onChange={e => setForm(f => ({ ...f, eventoId: e.target.value }))} required>
              <option value="">Seleccionar evento...</option>
              {eventos.map(ev => (
                <option key={ev.id} value={ev.id}>
                  {ev.nombre} — {formatDate(ev.fechaInicio)}
                </option>
              ))}
            </select>
            {eventos.length === 0 && (
              <p className="text-brand-500 text-xs mt-1">No hay eventos activos. El administrador debe crear un evento primero.</p>
            )}
          </div>

          <div>
            <label className="label">Cantidad de personas *</label>
            <input
              type="number" min={1} max={500}
              className="input" value={form.numPersonas}
              onChange={e => setForm(f => ({ ...f, numPersonas: parseInt(e.target.value) || 1 }))}
              required
            />
          </div>

          <div>
            <label className="label">Función a desempeñar *</label>
            <select className="input" value={form.funcion} onChange={e => setForm(f => ({ ...f, funcion: e.target.value }))} required>
              <option value="">Seleccionar función...</option>
              {FUNCIONES.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
            {form.funcion === 'Otro' && (
              <input
                className="input mt-2" placeholder="Describe la función..."
                value={form.funcionCustom}
                onChange={e => setForm(f => ({ ...f, funcionCustom: e.target.value }))}
              />
            )}
          </div>

          <div>
            <label className="label">Tarifa *</label>
            <div className="grid grid-cols-3 gap-3">
              {tarifas.map(t => (
                <button
                  key={t.tipo} type="button"
                  onClick={() => setForm(f => ({ ...f, tipoTarifa: t.tipo }))}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    form.tipoTarifa === t.tipo
                      ? 'border-brand-500 bg-brand-800/60 text-white'
                      : 'border-brand-700/40 bg-brand-900/40 text-brand-300 hover:border-brand-600'
                  }`}
                >
                  <p className="text-xs font-semibold uppercase tracking-wide">{TARIFA_LABELS[t.tipo]}</p>
                  <p className="text-lg font-bold mt-0.5">{formatCurrency(t.precioPorDia)}</p>
                  <p className="text-xs opacity-60">por día</p>
                </button>
              ))}
            </div>
          </div>

          {/* Cost estimate */}
          {estimado > 0 && (
            <div className="bg-gold-500/10 border border-gold-500/30 rounded-xl p-4 flex justify-between items-center">
              <div>
                <p className="text-gold-400 text-xs font-semibold uppercase tracking-wide">Estimado por día</p>
                <p className="text-white text-sm">{form.numPersonas} persona(s) × {formatCurrency(selectedTarifa!.precioPorDia)}</p>
              </div>
              <p className="text-gold-400 text-2xl font-bold">{formatCurrency(estimado)}</p>
            </div>
          )}

          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? 'Enviando...' : 'Enviar Solicitud'}
          </button>
        </form>
      </div>

      {/* My requests */}
      {solicitudes.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-white mb-4">Mis Solicitudes</h2>
          <div className="space-y-3">
            {solicitudes.map(s => (
              <div key={s.id} className="card p-4 flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-white truncate">{s.evento.nombre}</p>
                  <p className="text-brand-400 text-sm">{s.funcion} · {s.numPersonas} persona(s)</p>
                  <p className="text-brand-500 text-xs mt-1">
                    {TARIFA_LABELS[s.tarifa.tipo]} · {formatDate(s.createdAt)}
                  </p>
                  {s.costoTotal && (
                    <p className="text-gold-400 text-sm font-semibold mt-1">
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

'use client'

import { useEffect, useState } from 'react'
import { formatDate, formatCurrency, TARIFA_LABELS, ESTADO_COLORS, ESTADO_SOLICITUD_LABELS } from '@/lib/utils'

interface Solicitud {
  id: string
  numPersonas: number
  funcion: string
  estado: string
  costoTotal: number | null
  notaAdmin: string | null
  createdAt: string
  evento: { id: string; nombre: string; fechaInicio: string; fechaFin: string }
  solicitante: { name: string; email: string }
  tarifa: { tipo: string; precioPorDia: number }
}

export default function SolicitudesAdminPage() {
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([])
  const [selected, setSelected]       = useState<Solicitud | null>(null)
  const [costo, setCosto]             = useState('')
  const [nota, setNota]               = useState('')
  const [loading, setLoading]         = useState(false)
  const [filter, setFilter]           = useState<'TODAS' | 'PENDIENTE' | 'APROBADA' | 'RECHAZADA'>('PENDIENTE')

  useEffect(() => {
    fetch('/api/solicitudes').then(r => r.json()).then(setSolicitudes)
  }, [])

  const filtered = solicitudes.filter(s => filter === 'TODAS' || s.estado === filter)

  async function handleDecision(estado: 'APROBADA' | 'RECHAZADA') {
    if (!selected) return
    setLoading(true)
    const costoNum = parseFloat(costo)
    const res = await fetch(`/api/solicitudes/${selected.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        estado,
        costoTotal: estado === 'APROBADA' && !isNaN(costoNum) ? costoNum : null,
        notaAdmin: nota || null,
      }),
    })
    if (res.ok) {
      const updated = await res.json()
      setSolicitudes(prev => prev.map(s => s.id === updated.id ? updated : s))
      setSelected(null)
      setCosto('')
      setNota('')
    }
    setLoading(false)
  }

  const estimadoPorDia = selected ? selected.tarifa.precioPorDia * selected.numPersonas : 0

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Solicitudes de Personal</h1>
        <p className="text-gray-500 mt-1">Aprueba o rechaza solicitudes de personal eventual</p>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        {(['TODAS', 'PENDIENTE', 'APROBADA', 'RECHAZADA'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              filter === f
                ? 'bg-brand-700 text-white shadow-sm'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}>
            {f === 'TODAS' ? 'Todas' : ESTADO_SOLICITUD_LABELS[f]}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* List */}
        <div className="space-y-2">
          {filtered.length === 0 && (
            <div className="card p-6 text-center text-gray-400">No hay solicitudes en este estado.</div>
          )}
          {filtered.map(s => (
            <button
              key={s.id}
              onClick={() => { setSelected(s); setCosto(s.costoTotal?.toString() ?? ''); setNota(s.notaAdmin ?? '') }}
              className={`card w-full text-left p-4 hover:border-brand-300 hover:shadow-md transition-all ${selected?.id === s.id ? 'border-brand-400 shadow-md' : ''}`}
            >
              <div className="flex justify-between items-start mb-2">
                <p className="font-semibold text-gray-900 text-sm">{s.evento.nombre}</p>
                <span className={`badge ${ESTADO_COLORS[s.estado]}`}>{ESTADO_SOLICITUD_LABELS[s.estado]}</span>
              </div>
              <p className="text-gray-500 text-xs">{s.funcion} · {s.numPersonas} persona(s)</p>
              <p className="text-gray-400 text-xs mt-1">Por: {s.solicitante.name ?? s.solicitante.email}</p>
              <p className="text-gray-400 text-xs">{TARIFA_LABELS[s.tarifa.tipo]} · {formatDate(s.createdAt)}</p>
              {s.costoTotal && <p className="text-amber-600 text-xs mt-1 font-semibold">Costo: {formatCurrency(s.costoTotal)}</p>}
            </button>
          ))}
        </div>

        {/* Detail panel */}
        {selected && (
          <div className="card p-6 space-y-5 h-fit sticky top-4">
            <div>
              <h3 className="text-lg font-bold text-gray-900">{selected.evento.nombre}</h3>
              <p className="text-gray-500 text-sm">
                {formatDate(selected.evento.fechaInicio)} – {formatDate(selected.evento.fechaFin)}
              </p>
            </div>

            <div className="space-y-2 text-sm divide-y divide-gray-100">
              <Row label="Solicitante" value={selected.solicitante.name ?? selected.solicitante.email} />
              <Row label="Función"     value={selected.funcion} />
              <Row label="Personas"    value={`${selected.numPersonas}`} />
              <Row label="Tarifa"      value={TARIFA_LABELS[selected.tarifa.tipo]} />
              <Row label="Precio/día"  value={formatCurrency(selected.tarifa.precioPorDia)} />
              <Row label="Est./día"    value={formatCurrency(estimadoPorDia)} />
            </div>

            {selected.estado === 'PENDIENTE' && (
              <div className="space-y-3 pt-2 border-t border-gray-100">
                <div>
                  <label className="label">Costo total aprobado ($)</label>
                  <input
                    type="number" step="0.01" className="input" placeholder="Ej: 500.00"
                    value={costo} onChange={e => setCosto(e.target.value)}
                  />
                </div>
                <div>
                  <label className="label">Nota para el solicitante (opcional)</label>
                  <textarea
                    className="input resize-none h-20" placeholder="Comentario..."
                    value={nota} onChange={e => setNota(e.target.value)}
                  />
                </div>
                <div className="flex gap-3">
                  <button onClick={() => handleDecision('RECHAZADA')} disabled={loading} className="btn-danger flex-1">
                    Rechazar
                  </button>
                  <button onClick={() => handleDecision('APROBADA')} disabled={loading} className="btn-gold flex-1">
                    {loading ? '...' : 'Aprobar ✓'}
                  </button>
                </div>
              </div>
            )}

            {selected.estado !== 'PENDIENTE' && (
              <div className={`rounded-xl p-3 border ${ESTADO_COLORS[selected.estado]}`}>
                <p className="text-sm font-semibold">{ESTADO_SOLICITUD_LABELS[selected.estado]}</p>
                {selected.costoTotal && <p className="text-sm mt-1">Costo: {formatCurrency(selected.costoTotal)}</p>}
                {selected.notaAdmin && <p className="text-sm mt-1 opacity-80">{selected.notaAdmin}</p>}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-1.5">
      <span className="text-gray-500">{label}:</span>
      <span className="text-gray-900 font-medium">{value}</span>
    </div>
  )
}

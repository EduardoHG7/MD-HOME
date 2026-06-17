'use client'

import { useEffect, useState } from 'react'
import { formatDate, formatCurrency, TARIFA_LABELS, ESTADO_COLORS, ESTADO_SOLICITUD_LABELS } from '@/lib/utils'

interface Solicitud {
  id: string
  numPersonas: number
  funcion: string
  estado: string
  presupuesto: number | null
  costoTotal: number | null
  notaAdmin: string | null
  comentario: string | null
  aprobadoPor: { name: string | null; email: string } | null
  aprobadoEn: string | null
  createdAt: string
  fechaInicioLabor: string | null
  fechaFinLabor: string | null
  evento: { id: string; nombre: string; fechaInicio: string; fechaFin: string }
  solicitante: { name: string; email: string }
  tarifa: { id: string; tipo: string; precioPorDia: number } | null
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-2">
      <span className="text-gray-500 text-sm">{label}</span>
      <span className="text-gray-900 text-sm font-medium text-right max-w-[60%]">{value}</span>
    </div>
  )
}

export default function ContabilidadSolicitudesPage() {
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([])
  const [selected, setSelected] = useState<Solicitud | null>(null)
  const [filter, setFilter] = useState<'TODAS' | 'PENDIENTE' | 'APROBADA' | 'RECHAZADA'>('APROBADA')

  useEffect(() => {
    fetch('/api/solicitudes').then(r => r.json()).then(d => {
      if (Array.isArray(d)) setSolicitudes(d)
    })
  }, [])

  const filtered = solicitudes.filter(s => filter === 'TODAS' || s.estado === filter)

  function getDiasLabor(s: Solicitud) {
    const ini = s.fechaInicioLabor ?? s.evento.fechaInicio
    const fin = s.fechaFinLabor    ?? s.evento.fechaFin
    return Math.max(1, Math.ceil((new Date(fin).getTime() - new Date(ini).getTime()) / (1000 * 60 * 60 * 24)) + 1)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Solicitudes de Personal</h1>
        <p className="text-gray-500 mt-1">Vista de solo lectura</p>
      </div>

      <div className="flex gap-2 flex-wrap">
        {(['TODAS', 'PENDIENTE', 'APROBADA', 'RECHAZADA'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${filter === f ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {f === 'TODAS' ? 'Todas' : ESTADO_SOLICITUD_LABELS[f]}
            <span className="ml-1.5 text-xs opacity-70">({solicitudes.filter(s => f === 'TODAS' || s.estado === f).length})</span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-2">
          {filtered.length === 0 && <div className="card p-6 text-center text-gray-400">No hay solicitudes en este estado.</div>}
          {filtered.map(s => (
            <button key={s.id} onClick={() => setSelected(s)}
              className={`w-full text-left card p-4 transition-all hover:shadow-md ${selected?.id === s.id ? 'ring-2 ring-gray-900' : ''}`}>
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold text-gray-900 text-sm">{s.evento.nombre}</p>
                <span className={`badge ${ESTADO_COLORS[s.estado]} shrink-0`}>{ESTADO_SOLICITUD_LABELS[s.estado]}</span>
              </div>
              <p className="text-gray-500 text-xs">{s.funcion} · {s.numPersonas} persona(s)</p>
              <p className="text-gray-400 text-xs mt-1">Por: {s.solicitante.name ?? s.solicitante.email}</p>
              <p className="text-gray-400 text-xs">{formatDate(s.createdAt)}</p>
              {s.costoTotal != null && <p className="text-amber-600 text-xs font-semibold mt-1">Aprobado: {formatCurrency(s.costoTotal)}</p>}
            </button>
          ))}
        </div>

        {selected && (
          <div className="card p-6 space-y-4 h-fit sticky top-4">
            <div>
              <h3 className="text-lg font-bold text-gray-900">{selected.evento.nombre}</h3>
              <p className="text-gray-500 text-sm">{formatDate(selected.evento.fechaInicio)} – {formatDate(selected.evento.fechaFin)}</p>
            </div>

            <div className="space-y-0 text-sm divide-y divide-gray-100">
              <Row label="Solicitante" value={selected.solicitante.name ?? selected.solicitante.email} />
              <Row label="Función"     value={selected.funcion} />
              <Row label="Personas"    value={`${selected.numPersonas}`} />
              {selected.fechaInicioLabor && selected.fechaFinLabor && (
                <Row label="Fechas de labor" value={`${formatDate(selected.fechaInicioLabor)} – ${formatDate(selected.fechaFinLabor)} (${getDiasLabor(selected)} día(s))`} />
              )}
              {selected.presupuesto != null && <Row label="Presupuesto cliente" value={formatCurrency(selected.presupuesto)} />}
              {selected.comentario && <Row label="Comentario" value={selected.comentario} />}
              {selected.tarifa && <Row label="Tarifa" value={`${TARIFA_LABELS[selected.tarifa.tipo]} — ${formatCurrency(selected.tarifa.precioPorDia)}/día`} />}
              {selected.costoTotal != null && <Row label="Costo aprobado" value={formatCurrency(selected.costoTotal)} />}
            </div>

            {selected.estado !== 'PENDIENTE' && (
              <div className={`rounded-xl p-3 border space-y-1 ${ESTADO_COLORS[selected.estado]}`}>
                <p className="text-sm font-semibold">{ESTADO_SOLICITUD_LABELS[selected.estado]}</p>
                {selected.aprobadoPor && (
                  <p className="text-xs opacity-80">
                    Por: <span className="font-semibold">{selected.aprobadoPor.name ?? selected.aprobadoPor.email}</span>
                    {selected.aprobadoEn && <> · {new Date(selected.aprobadoEn).toLocaleString('es-PA', { day: '2-digit', month: 'short', year: 'numeric' })}</>}
                  </p>
                )}
                {selected.notaAdmin && <p className="text-sm opacity-80">{selected.notaAdmin}</p>}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

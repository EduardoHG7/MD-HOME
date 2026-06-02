'use client'

import { useEffect, useState } from 'react'
import { formatDate, formatCurrency, TARIFA_LABELS, ESTADO_COLORS, ESTADO_SOLICITUD_LABELS } from '@/lib/utils'

interface Tarifa   { id: string; tipo: string; precioPorDia: number }
interface Registro  { id: string; tipo: string; timestamp: string }
interface Asignacion {
  id:        string
  eventoId:  string
  funcion:   string
  aplicante: { id: string; nombreCompleto: string; cedula: string }
  registros: Registro[]
}
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
  tarifa: Tarifa | null
  asignaciones: Asignacion[]
}

export default function SolicitudesAdminPage() {
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([])
  const [tarifas,     setTarifas]     = useState<Tarifa[]>([])
  const [selected,    setSelected]    = useState<Solicitud | null>(null)
  const [costo,       setCosto]       = useState('')
  const [nota,        setNota]        = useState('')
  const [tipoTarifa,  setTipoTarifa]  = useState('')
  const [loading,     setLoading]     = useState(false)
  const [copiedId,    setCopiedId]    = useState<string | null>(null)
  const [filter, setFilter] = useState<'TODAS' | 'PENDIENTE' | 'APROBADA' | 'RECHAZADA'>('PENDIENTE')

  function copiarLinkEvento(aplicanteId: string, eventoId: string) {
    const url = `${window.location.origin}/aplicante/${aplicanteId}?evento=${eventoId}`
    navigator.clipboard.writeText(url)
    setCopiedId(aplicanteId)
    setTimeout(() => setCopiedId(null), 2000)
  }

  useEffect(() => {
    Promise.all([
      fetch('/api/solicitudes').then(r => r.json()),
      fetch('/api/tarifas').then(r => r.json()),
    ]).then(([sol, tar]) => {
      setSolicitudes(sol)
      setTarifas(tar)
    })
  }, [])

  const filtered = solicitudes.filter(s => filter === 'TODAS' || s.estado === filter)

  function selectSolicitud(s: Solicitud) {
    setSelected(s)
    setCosto(s.costoTotal?.toString() ?? '')
    setNota(s.notaAdmin ?? '')
    setTipoTarifa(s.tarifa?.tipo ?? (tarifas[0]?.tipo ?? ''))
  }

  // Auto-calcular estimado cuando cambia tarifa o personas
  const selectedTarifa = tarifas.find(t => t.tipo === tipoTarifa)
  const estimadoPorDia = selectedTarifa && selected
    ? selectedTarifa.precioPorDia * selected.numPersonas
    : 0

  // Al cambiar tarifa, auto-rellenar el costo total si está vacío
  function handleTarifaChange(tipo: string) {
    setTipoTarifa(tipo)
    if (!costo && selected) {
      const tarifa = tarifas.find(t => t.tipo === tipo)
      if (tarifa) {
        const ms   = new Date(selected.evento.fechaFin).getTime() - new Date(selected.evento.fechaInicio).getTime()
        const dias = Math.max(1, Math.ceil(ms / (1000 * 60 * 60 * 24)) + 1)
        setCosto((tarifa.precioPorDia * selected.numPersonas * dias).toFixed(2))
      }
    }
  }

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
        notaAdmin:  nota || null,
        tipoTarifa: estado === 'APROBADA' ? tipoTarifa : undefined,
      }),
    })
    if (res.ok) {
      const updated = await res.json()
      setSolicitudes(prev => prev.map(s => s.id === updated.id ? updated : s))
      setSelected(null)
      setCosto('')
      setNota('')
      setTipoTarifa('')
    }
    setLoading(false)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Solicitudes de Personal</h1>
        <p className="text-gray-500 mt-1">Aprueba o rechaza solicitudes y asigna la tarifa correspondiente</p>
      </div>

      {/* Filtros */}
      <div className="flex gap-2">
        {(['TODAS', 'PENDIENTE', 'APROBADA', 'RECHAZADA'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              filter === f
                ? 'bg-gray-900 text-white shadow-sm'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}>
            {f === 'TODAS' ? 'Todas' : ESTADO_SOLICITUD_LABELS[f]}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Lista */}
        <div className="space-y-2">
          {filtered.length === 0 && (
            <div className="card p-6 text-center text-gray-400">No hay solicitudes en este estado.</div>
          )}
          {filtered.map(s => (
            <button
              key={s.id}
              onClick={() => selectSolicitud(s)}
              className={`card w-full text-left p-4 hover:border-gray-400 hover:shadow-md transition-all ${selected?.id === s.id ? 'border-gray-400 shadow-md' : ''}`}
            >
              <div className="flex justify-between items-start mb-2">
                <p className="font-semibold text-gray-900 text-sm">{s.evento.nombre}</p>
                <span className={`badge ${ESTADO_COLORS[s.estado]}`}>{ESTADO_SOLICITUD_LABELS[s.estado]}</span>
              </div>
              <p className="text-gray-500 text-xs">{s.funcion} · {s.numPersonas} persona(s)</p>
              <p className="text-gray-400 text-xs mt-1">Por: {s.solicitante.name ?? s.solicitante.email}</p>
              <p className="text-gray-400 text-xs">{formatDate(s.createdAt)}</p>
              {s.costoTotal && <p className="text-amber-600 text-xs mt-1 font-semibold">Costo: {formatCurrency(s.costoTotal)}</p>}
            </button>
          ))}
        </div>

        {/* Panel de detalle */}
        {selected && (
          <div className="card p-6 space-y-5 h-fit sticky top-4">
            <div>
              <h3 className="text-lg font-bold text-gray-900">{selected.evento.nombre}</h3>
              <p className="text-gray-500 text-sm">
                {formatDate(selected.evento.fechaInicio)} – {formatDate(selected.evento.fechaFin)}
              </p>
            </div>

            <div className="space-y-0 text-sm divide-y divide-gray-100">
              <Row label="Solicitante" value={selected.solicitante.name ?? selected.solicitante.email} />
              <Row label="Función"     value={selected.funcion} />
              <Row label="Personas"    value={`${selected.numPersonas}`} />
            </div>

            {selected.estado === 'PENDIENTE' && (
              <div className="space-y-3 pt-2 border-t border-gray-100">
                {/* Tarifa */}
                <div>
                  <label className="label">Tipo de tarifa *</label>
                  <div className="grid grid-cols-3 gap-2">
                    {tarifas.map(t => (
                      <button key={t.tipo} type="button"
                        onClick={() => handleTarifaChange(t.tipo)}
                        className={`p-2 rounded-xl border-2 text-center transition-all ${
                          tipoTarifa === t.tipo
                            ? 'border-gray-900 bg-gray-50'
                            : 'border-gray-200 bg-white hover:border-gray-300'
                        }`}>
                        <p className="text-xs font-semibold text-gray-500">{TARIFA_LABELS[t.tipo]}</p>
                        <p className="text-sm font-bold text-gray-900">{formatCurrency(t.precioPorDia)}/día</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Estimado */}
                {estimadoPorDia > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 flex justify-between text-sm">
                    <span className="text-amber-700">Est. por día ({selected.numPersonas} × {formatCurrency(selectedTarifa!.precioPorDia)})</span>
                    <span className="text-amber-600 font-bold">{formatCurrency(estimadoPorDia)}</span>
                  </div>
                )}

                {/* Costo total */}
                <div>
                  <label className="label">Costo total aprobado ($)</label>
                  <input
                    type="number" step="0.01" className="input" placeholder="Ej: 1500.00"
                    value={costo} onChange={e => setCosto(e.target.value)}
                  />
                </div>

                {/* Nota */}
                <div>
                  <label className="label">Nota para el solicitante (opcional)</label>
                  <textarea
                    className="input resize-none h-20" placeholder="Comentario..."
                    value={nota} onChange={e => setNota(e.target.value)}
                  />
                </div>

                <div className="flex gap-3">
                  <button onClick={() => handleDecision('RECHAZADA')} disabled={loading}
                    className="flex-1 px-4 py-2 rounded-xl border-2 border-red-200 text-red-600 hover:bg-red-50 font-medium text-sm transition-all">
                    Rechazar
                  </button>
                  <button onClick={() => handleDecision('APROBADA')} disabled={loading || !tipoTarifa}
                    className="flex-1 btn-primary">
                    {loading ? '...' : 'Aprobar ✓'}
                  </button>
                </div>
              </div>
            )}

            {selected.estado !== 'PENDIENTE' && (
              <div className={`rounded-xl p-3 border ${ESTADO_COLORS[selected.estado]}`}>
                <p className="text-sm font-semibold">{ESTADO_SOLICITUD_LABELS[selected.estado]}</p>
                {selected.tarifa && <p className="text-sm mt-1">Tarifa: {TARIFA_LABELS[selected.tarifa.tipo]}</p>}
                {selected.costoTotal && <p className="text-sm mt-1">Costo total: {formatCurrency(selected.costoTotal)}</p>}
                {selected.notaAdmin && <p className="text-sm mt-1 opacity-80">{selected.notaAdmin}</p>}
              </div>
            )}

            {/* Asignaciones y asistencias */}
            {(selected.asignaciones ?? []).length > 0 && (
              <div className="pt-2 border-t border-gray-100">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                  Personal asignado ({selected.asignaciones.length}/{selected.numPersonas})
                </p>
                <div className="space-y-2">
                  {selected.asignaciones.map(a => {
                    const entrada = a.registros?.find(r => r.tipo === 'ENTRADA')
                    const salida  = a.registros?.find(r => r.tipo === 'SALIDA')
                    return (
                      <div key={a.id} className="rounded-xl border border-gray-200 overflow-hidden">
                        <div className="flex items-center justify-between px-3 py-2 bg-white">
                          <div>
                            <p className="text-sm font-medium text-gray-900">{a.aplicante.nombreCompleto}</p>
                            <p className="text-xs text-gray-400">{a.aplicante.cedula}</p>
                          </div>
                          <button
                            onClick={() => copiarLinkEvento(a.aplicante.id, selected.evento.id)}
                            className={`text-xs px-2 py-1 rounded-lg border font-medium transition-all ${
                              copiedId === a.aplicante.id
                                ? 'border-green-300 bg-green-50 text-green-600'
                                : 'border-gray-200 text-gray-600 hover:border-gray-400'
                            }`}
                          >
                            {copiedId === a.aplicante.id ? '✓ Copiado' : '🔗 Link QR'}
                          </button>
                        </div>
                        <div className="flex gap-4 px-3 py-1.5 bg-gray-50 border-t border-gray-100 text-xs">
                          {entrada
                            ? <span className="text-green-600 font-medium">↓ {new Date(entrada.timestamp).toLocaleString('es-PA', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                            : <span className="text-gray-300">Sin entrada</span>
                          }
                          {salida
                            ? <span className="text-blue-600 font-medium">↑ {new Date(salida.timestamp).toLocaleString('es-PA', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                            : <span className="text-gray-300">Sin salida</span>
                          }
                        </div>
                      </div>
                    )
                  })}
                </div>
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

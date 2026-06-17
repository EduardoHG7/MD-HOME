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
  tarifa: Tarifa | null
  asignaciones: Asignacion[]
}

interface CotFact { id: string; descripcion: string; proveedor: string | null; monto: number; archivoNombre: string | null }
interface CotAdmin {
  id: string; descripcion: string | null; estado: string; notaAdmin: string | null
  montoTotal: number; createdAt: string
  archivoUrl: string | null; archivoNombreCot: string | null
  aprobadaPor: { name: string | null; email: string } | null
  aprobadaEn: string | null
  facturas: CotFact[]
  creadoPor: { name: string | null; email: string }
  linea: {
    descripcion: string
    categoria: {
      nombre: string
      presupuesto: { evento: { nombre: string; id: string } }
    }
  }
}

const COT_COLORS: Record<string, string> = {
  PENDIENTE: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  APROBADA:  'bg-green-100 text-green-700 border-green-200',
  RECHAZADA: 'bg-red-100 text-red-600 border-red-200',
}

export default function SolicitudesAdminPage() {
  const [mainTab,     setMainTab]     = useState<'personal' | 'cotizaciones'>('personal')
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([])
  const [cotizaciones, setCotizaciones] = useState<CotAdmin[]>([])
  const [tarifas,     setTarifas]     = useState<Tarifa[]>([])
  const [selected,    setSelected]    = useState<Solicitud | null>(null)
  const [costo,       setCosto]       = useState('')
  const [nota,        setNota]        = useState('')
  const [tipoTarifa,  setTipoTarifa]  = useState('')
  const [loading,     setLoading]     = useState(false)
  const [deleting,    setDeleting]    = useState<string | null>(null)
  const [copiedId,    setCopiedId]    = useState<string | null>(null)
  const [filter, setFilter] = useState<'TODAS' | 'PENDIENTE' | 'APROBADA' | 'RECHAZADA'>('PENDIENTE')
  const [cotFilter, setCotFilter] = useState<'TODAS' | 'PENDIENTE' | 'APROBADA' | 'RECHAZADA'>('PENDIENTE')
  const [selectedCot, setSelectedCot] = useState<CotAdmin | null>(null)
  const [cotNota, setCotNota] = useState('')
  const [savingCot, setSavingCot] = useState(false)
  const [editingCosto, setEditingCosto] = useState(false)
  const [nuevoCosto,   setNuevoCosto]   = useState('')

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
      fetch('/api/cotizaciones').then(r => r.json()),
    ]).then(([sol, tar, cot]) => {
      setSolicitudes(Array.isArray(sol) ? sol : [])
      setTarifas(Array.isArray(tar) ? tar : [])
      setCotizaciones(Array.isArray(cot) ? cot : [])
    })
  }, [])

  const filtered    = solicitudes.filter(s => filter === 'TODAS' || s.estado === filter)
  const filteredCot = cotizaciones.filter(c => cotFilter === 'TODAS' || c.estado === cotFilter)

  function selectSolicitud(s: Solicitud) {
    setSelected(s)
    setCosto(s.costoTotal?.toString() ?? '')
    setNota(s.notaAdmin ?? '')
    setTipoTarifa(s.tarifa?.tipo ?? (tarifas[0]?.tipo ?? ''))
    setEditingCosto(false)
    setNuevoCosto(s.costoTotal?.toString() ?? '')
  }

  const selectedTarifa = tarifas.find(t => t.tipo === tipoTarifa)
  const estimadoPorDia = selectedTarifa && selected ? selectedTarifa.precioPorDia * selected.numPersonas : 0

  function getDiasLabor(s: Solicitud) {
    const ini = s.fechaInicioLabor ?? s.evento.fechaInicio
    const fin = s.fechaFinLabor    ?? s.evento.fechaFin
    return Math.max(1, Math.ceil((new Date(fin).getTime() - new Date(ini).getTime()) / (1000 * 60 * 60 * 24)) + 1)
  }

  function handleTarifaChange(tipo: string) {
    setTipoTarifa(tipo)
    if (!costo && selected) {
      const tarifa = tarifas.find(t => t.tipo === tipo)
      if (tarifa) {
        const dias = getDiasLabor(selected)
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
      setSelected(null); setCosto(''); setNota(''); setTipoTarifa('')
    }
    setLoading(false)
  }


  async function handleReenviar() {
    if (!selected) return
    setLoading(true)
    const costoNum = parseFloat(nuevoCosto)
    const res = await fetch(`/api/solicitudes/${selected.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        estado: 'APROBADA',
        costoTotal: !isNaN(costoNum) && nuevoCosto ? costoNum : selected.costoTotal,
        notaAdmin: selected.notaAdmin ?? null,
        tipoTarifa: selected.tarifa?.tipo,
      }),
    })
    if (res.ok) {
      const updated = await res.json()
      setSolicitudes(prev => prev.map(s => s.id === updated.id ? updated : s))
      setSelected(updated)
      setEditingCosto(false)
    }
    setLoading(false)
  }

  async function handleDeleteSolicitud(id: string) {
    if (!confirm('¿Eliminar esta solicitud? Esta acción no se puede deshacer.')) return
    setDeleting(id)
    const res = await fetch(`/api/solicitudes/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setSolicitudes(prev => prev.filter(s => s.id !== id))
      if (selected?.id === id) setSelected(null)
    }
    setDeleting(null)
  }

  async function handleCotDecision(cotId: string, estado: 'APROBADA' | 'RECHAZADA') {
    setSavingCot(true)
    const res = await fetch(`/api/cotizaciones/${cotId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado, notaAdmin: cotNota || null }),
    })
    if (res.ok) {
      const nota = cotNota || null
      setCotizaciones(prev => prev.map(c => c.id === cotId ? { ...c, estado, notaAdmin: nota } : c))
      setSelectedCot(prev => prev?.id === cotId ? { ...prev, estado, notaAdmin: nota } : prev)
    }
    setSavingCot(false)
  }

  async function handleDeleteCot(id: string) {
    if (!confirm('¿Eliminar esta cotización?')) return
    setDeleting(id)
    const res = await fetch(`/api/cotizaciones/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setCotizaciones(prev => prev.filter(c => c.id !== id))
      if (selectedCot?.id === id) setSelectedCot(null)
    }
    setDeleting(null)
  }

  const pendPersonal = solicitudes.filter(s => s.estado === 'PENDIENTE').length
  const pendCot      = cotizaciones.filter(c => c.estado === 'PENDIENTE').length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Solicitudes</h1>
        <p className="text-gray-500 mt-1">Gestiona solicitudes de personal y cotizaciones</p>
      </div>

      {/* Main tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-2xl p-1 w-fit">
        <button onClick={() => setMainTab('personal')}
          className={`px-5 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-2 ${mainTab === 'personal' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
          👥 Personal
          {pendPersonal > 0 && <span className="bg-amber-400 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">{pendPersonal}</span>}
        </button>
        <button onClick={() => setMainTab('cotizaciones')}
          className={`px-5 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-2 ${mainTab === 'cotizaciones' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
          📋 Cotizaciones
          {pendCot > 0 && <span className="bg-amber-400 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">{pendCot}</span>}
        </button>
      </div>

      {/* ══ TAB: PERSONAL ══ */}
      {mainTab === 'personal' && (
        <>
          <div className="flex gap-2">
            {(['TODAS', 'PENDIENTE', 'APROBADA', 'RECHAZADA'] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${filter === f ? 'bg-gray-900 text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                {f === 'TODAS' ? 'Todas' : ESTADO_SOLICITUD_LABELS[f]}
                <span className="ml-1.5 text-xs opacity-70">({solicitudes.filter(s => f === 'TODAS' || s.estado === f).length})</span>
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Lista */}
            <div className="space-y-2">
              {filtered.length === 0 && <div className="card p-6 text-center text-gray-400">No hay solicitudes en este estado.</div>}
              {filtered.map(s => (
                <button key={s.id} onClick={() => selectSolicitud(s)}
                  className={`card w-full text-left p-4 hover:border-gray-400 hover:shadow-md transition-all ${selected?.id === s.id ? 'border-gray-400 shadow-md' : ''}`}>
                  <div className="flex justify-between items-start mb-2">
                    <p className="font-semibold text-gray-900 text-sm">{s.evento.nombre}</p>
                    <span className={`badge ${ESTADO_COLORS[s.estado]}`}>{ESTADO_SOLICITUD_LABELS[s.estado]}</span>
                  </div>
                  <p className="text-gray-500 text-xs">{s.funcion} · {s.numPersonas} persona(s)</p>
                  <p className="text-gray-400 text-xs mt-1">Por: {s.solicitante.name ?? s.solicitante.email}</p>
                  <p className="text-gray-400 text-xs">{formatDate(s.createdAt)}</p>
                  {s.presupuesto != null && <p className="text-blue-500 text-xs mt-1">Presupuesto: {formatCurrency(s.presupuesto)}</p>}
                  {s.costoTotal  != null && (
                    <div className="flex items-center gap-2 mt-1">
                      <p className="text-amber-600 text-xs font-semibold">Costo: {formatCurrency(s.costoTotal)}</p>
                      {s.presupuesto != null && (
                        <span className={`text-xs font-semibold ${s.presupuesto - s.costoTotal >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                          ({s.presupuesto - s.costoTotal >= 0 ? '+' : ''}{formatCurrency(s.presupuesto - s.costoTotal)})
                        </span>
                      )}
                    </div>
                  )}
                </button>
              ))}
            </div>

            {/* Panel detalle */}
            {selected && (
              <div className="card p-6 space-y-5 h-fit sticky top-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">{selected.evento.nombre}</h3>
                    <p className="text-gray-500 text-sm">{formatDate(selected.evento.fechaInicio)} – {formatDate(selected.evento.fechaFin)}</p>
                  </div>
                  <button onClick={() => handleDeleteSolicitud(selected.id)} disabled={deleting === selected.id}
                    className="text-xs px-3 py-1.5 rounded-xl border border-red-200 text-red-500 hover:bg-red-50 transition-all font-medium">
                    {deleting === selected.id ? '...' : '🗑 Eliminar'}
                  </button>
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
                </div>

                {selected.estado === 'PENDIENTE' && (
                  <div className="space-y-3 pt-2 border-t border-gray-100">
                    <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-800">
                      <p>💡 Recuerda que el monto es en base a 8 horas laboradas. Este puede subir dependiendo de las horas extras, hasta <strong>$50.00</strong> máximo.</p>
                    </div>
                    <div>
                      <label className="label">Tipo de tarifa <span className="text-gray-400 font-normal">(opcional — para calcular el monto)</span></label>
                      <div className="grid grid-cols-2 gap-2">
                        {tarifas.map(t => (
                          <button key={t.tipo} type="button" onClick={() => handleTarifaChange(t.tipo)}
                            className={`p-2 rounded-xl border-2 text-center transition-all ${tipoTarifa === t.tipo ? 'border-gray-900 bg-gray-50' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
                            <p className="text-xs font-semibold text-gray-500">{TARIFA_LABELS[t.tipo]}</p>
                            <p className="text-sm font-bold text-gray-900">{formatCurrency(t.precioPorDia)}/día</p>
                          </button>
                        ))}
                        <button type="button" onClick={() => { setTipoTarifa(''); setCosto('') }}
                          className={`p-2 rounded-xl border-2 text-center transition-all ${tipoTarifa === '' && costo === '' ? 'border-gray-900 bg-gray-50' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
                          <p className="text-xs font-semibold text-gray-500">Monto personalizado</p>
                          <p className="text-sm font-bold text-gray-900">Ingresar manualmente</p>
                        </button>
                      </div>
                    </div>
                    {estimadoPorDia > 0 && (
                      <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-sm space-y-1">
                        <div className="flex justify-between">
                          <span className="text-amber-700">Por día ({selected.numPersonas} × {formatCurrency(selectedTarifa!.precioPorDia)})</span>
                          <span className="text-amber-600 font-bold">{formatCurrency(estimadoPorDia)}</span>
                        </div>
                        <div className="flex justify-between font-semibold">
                          <span className="text-amber-700">Total estimado ({getDiasLabor(selected)} día(s))</span>
                          <span className="text-amber-600">{formatCurrency(estimadoPorDia * getDiasLabor(selected))}</span>
                        </div>
                      </div>
                    )}
                    <div>
                      <label className="label">Total preaprobado ($)</label>
                      <input type="number" step="0.01" className="input" placeholder="Ej: 1500.00" value={costo} onChange={e => setCosto(e.target.value)} />
                    </div>
                    <div>
                      <label className="label">Nota para el solicitante (opcional)</label>
                      <textarea className="input resize-none h-20" placeholder="Comentario..." value={nota} onChange={e => setNota(e.target.value)} />
                    </div>
                    {selected.presupuesto != null && costo && !isNaN(parseFloat(costo)) && (() => {
                      const costoNum = parseFloat(costo); const ganancia = selected.presupuesto - costoNum
                      const pct = selected.presupuesto > 0 ? Math.round((ganancia / selected.presupuesto) * 100) : 0
                      const positivo = ganancia >= 0
                      return (
                        <div className={`rounded-xl px-4 py-3 border ${positivo ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                          <div className="flex justify-between items-center">
                            <div>
                              <p className={`text-xs font-semibold ${positivo ? 'text-green-700' : 'text-red-700'}`}>{positivo ? '✅ Ganancia estimada' : '❌ Pérdida estimada'}</p>
                              <p className="text-gray-500 text-xs mt-0.5">Presupuesto {formatCurrency(selected.presupuesto)} − Costo {formatCurrency(costoNum)}</p>
                            </div>
                            <div className="text-right">
                              <p className={`text-xl font-bold ${positivo ? 'text-green-600' : 'text-red-600'}`}>{positivo ? '+' : ''}{formatCurrency(ganancia)}</p>
                              <p className={`text-xs ${positivo ? 'text-green-500' : 'text-red-500'}`}>{pct}% margen</p>
                            </div>
                          </div>
                        </div>
                      )
                    })()}
                    <div className="flex gap-3">
                      <button onClick={() => handleDecision('RECHAZADA')} disabled={loading}
                        className="flex-1 px-4 py-2 rounded-xl border-2 border-red-200 text-red-600 hover:bg-red-50 font-medium text-sm transition-all">Rechazar</button>
                      <button onClick={() => handleDecision('APROBADA')} disabled={loading || !costo}
                        className="flex-1 btn-primary">{loading ? '...' : 'Aprobar ✓'}</button>
                    </div>
                  </div>
                )}

                {selected.estado !== 'PENDIENTE' && (
                  <div className="space-y-3">
                    <div className={`rounded-xl p-3 border space-y-1 ${ESTADO_COLORS[selected.estado]}`}>
                      <p className="text-sm font-semibold">{ESTADO_SOLICITUD_LABELS[selected.estado]}</p>
                      {selected.tarifa && <p className="text-sm">Tarifa: {TARIFA_LABELS[selected.tarifa.tipo]}</p>}
                      {selected.costoTotal != null && <p className="text-sm font-medium">Total preaprobado: {formatCurrency(selected.costoTotal)}</p>}
                      {selected.aprobadoPor && (
                        <p className="text-xs opacity-80">
                          Aprobado por: <span className="font-semibold">{selected.aprobadoPor.name ?? selected.aprobadoPor.email}</span>
                          {selected.aprobadoEn && <> · {new Date(selected.aprobadoEn).toLocaleString('es-PA', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</>}
                        </p>
                      )}
                      {selected.notaAdmin && <p className="text-sm opacity-80">{selected.notaAdmin}</p>}
                    </div>

                    {selected.estado === 'APROBADA' && (
                      editingCosto ? (
                        <div className="space-y-2 p-3 border border-amber-200 bg-amber-50 rounded-xl">
                          <label className="text-xs font-semibold text-amber-700">Nuevo monto aprobado ($)</label>
                          <input
                            type="number" step="0.01"
                            className="input"
                            value={nuevoCosto}
                            onChange={e => setNuevoCosto(e.target.value)}
                          />
                          <div className="flex gap-2">
                            <button onClick={() => setEditingCosto(false)}
                              className="flex-1 px-3 py-2 rounded-xl border border-gray-200 text-gray-500 text-sm hover:bg-gray-50 transition-all">
                              Cancelar
                            </button>
                            <button onClick={handleReenviar} disabled={loading || !nuevoCosto}
                              className="flex-1 btn-primary text-sm">
                              {loading ? '...' : '📲 Actualizar y reenviar'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setNuevoCosto(selected.costoTotal?.toString() ?? ''); setEditingCosto(true) }}
                          className="w-full px-4 py-2.5 rounded-xl border border-amber-200 text-amber-700 bg-amber-50 hover:bg-amber-100 text-sm font-medium transition-all">
                          ✏️ Editar monto y reenviar confirmación
                        </button>
                      )
                    )}
                  </div>
                )}

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
                              <button onClick={() => copiarLinkEvento(a.aplicante.id, selected.evento.id)}
                                className={`text-xs px-2 py-1 rounded-lg border font-medium transition-all ${copiedId === a.aplicante.id ? 'border-green-300 bg-green-50 text-green-600' : 'border-gray-200 text-gray-600 hover:border-gray-400'}`}>
                                {copiedId === a.aplicante.id ? '✓ Copiado' : '🔗 Link QR'}
                              </button>
                            </div>
                            <div className="flex gap-4 px-3 py-1.5 bg-gray-50 border-t border-gray-100 text-xs">
                              {entrada ? <span className="text-green-600 font-medium">↓ {new Date(entrada.timestamp).toLocaleString('es-PA', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span> : <span className="text-gray-300">Sin entrada</span>}
                              {salida  ? <span className="text-blue-600 font-medium">↑ {new Date(salida.timestamp).toLocaleString('es-PA', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>  : <span className="text-gray-300">Sin salida</span>}
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
        </>
      )}

      {/* ══ TAB: COTIZACIONES ══ */}
      {mainTab === 'cotizaciones' && (
        <>
          <div className="flex gap-2">
            {(['TODAS', 'PENDIENTE', 'APROBADA', 'RECHAZADA'] as const).map(f => (
              <button key={f} onClick={() => setCotFilter(f)}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${cotFilter === f ? 'bg-gray-900 text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                {f === 'TODAS' ? 'Todas' : f.charAt(0) + f.slice(1).toLowerCase()}
                <span className="ml-1.5 text-xs opacity-70">({cotizaciones.filter(c => f === 'TODAS' || c.estado === f).length})</span>
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Lista cotizaciones */}
            <div className="space-y-2">
              {filteredCot.length === 0 && <div className="card p-6 text-center text-gray-400">No hay cotizaciones en este estado.</div>}
              {filteredCot.map(c => (
                <button key={c.id} onClick={() => { setSelectedCot(c); setCotNota(c.notaAdmin ?? '') }}
                  className={`card w-full text-left p-4 hover:border-gray-400 hover:shadow-md transition-all ${selectedCot?.id === c.id ? 'border-gray-400 shadow-md' : ''}`}>
                  <div className="flex justify-between items-start mb-1">
                    <p className="font-semibold text-gray-900 text-sm truncate pr-2">{c.linea.categoria.presupuesto.evento.nombre}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium border shrink-0 ${COT_COLORS[c.estado]}`}>{c.estado}</span>
                  </div>
                  <p className="text-xs text-gray-500">{c.linea.categoria.nombre} › {c.linea.descripcion}</p>
                  <p className="text-xs text-gray-400 mt-1">Por: {c.creadoPor.name ?? c.creadoPor.email} · {formatDate(c.createdAt)}</p>
                  {c.descripcion && <p className="text-xs text-gray-500 mt-1 italic">{c.descripcion}</p>}
                  <p className="text-sm font-bold text-gray-900 mt-2">{formatCurrency(c.montoTotal)}</p>
                </button>
              ))}
            </div>

            {/* Panel detalle cotización */}
            {selectedCot && (
              <div className="card p-6 space-y-5 h-fit sticky top-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">{selectedCot.linea.categoria.presupuesto.evento.nombre}</h3>
                    <p className="text-gray-500 text-sm">{selectedCot.linea.categoria.nombre} › {selectedCot.linea.descripcion}</p>
                  </div>
                  <button onClick={() => handleDeleteCot(selectedCot.id)} disabled={deleting === selectedCot.id}
                    className="text-xs px-3 py-1.5 rounded-xl border border-red-200 text-red-500 hover:bg-red-50 transition-all font-medium">
                    {deleting === selectedCot.id ? '...' : '🗑 Eliminar'}
                  </button>
                </div>

                <div className="space-y-0 text-sm divide-y divide-gray-100">
                  <Row label="Enviado por" value={selectedCot.creadoPor.name ?? selectedCot.creadoPor.email} />
                  <Row label="Fecha"       value={formatDate(selectedCot.createdAt)} />
                  <Row label="Total"       value={formatCurrency(selectedCot.montoTotal)} />
                </div>

                {selectedCot.descripcion && (
                  <p className="text-sm text-gray-600 bg-gray-50 rounded-xl px-4 py-3 italic">{selectedCot.descripcion}</p>
                )}

                {selectedCot.archivoUrl && (
                  <a href={selectedCot.archivoUrl} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 px-4 py-3 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-700 hover:bg-blue-100 transition-all font-medium">
                    🔎 {selectedCot.archivoNombreCot ?? 'Ver adjunto'}
                  </a>
                )}

                {selectedCot.facturas.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Desglose</p>
                    <div className="space-y-1">
                      {selectedCot.facturas.map(f => (
                        <div key={f.id} className="flex justify-between text-sm bg-gray-50 rounded-lg px-3 py-2">
                          <div>
                            <span className="font-medium text-gray-900">{f.descripcion}</span>
                            {f.proveedor && <span className="text-gray-400 ml-2 text-xs">({f.proveedor})</span>}
                          </div>
                          <span className="font-semibold text-gray-900">{formatCurrency(f.monto)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {selectedCot.estado === 'PENDIENTE' && (
                  <div className="space-y-3 pt-2 border-t border-gray-100">
                    <div>
                      <label className="label">Nota para el usuario (opcional)</label>
                      <textarea className="input resize-none h-16" placeholder="Comentario..." value={cotNota} onChange={e => setCotNota(e.target.value)} />
                    </div>
                    <div className="flex gap-3">
                      <button onClick={() => handleCotDecision(selectedCot.id, 'RECHAZADA')} disabled={savingCot}
                        className="flex-1 px-4 py-2 rounded-xl border-2 border-red-200 text-red-600 hover:bg-red-50 font-medium text-sm">Rechazar</button>
                      <button onClick={() => handleCotDecision(selectedCot.id, 'APROBADA')} disabled={savingCot}
                        className="flex-1 btn-primary">{savingCot ? '...' : 'Aprobar ✓'}</button>
                    </div>
                  </div>
                )}

                {selectedCot.estado !== 'PENDIENTE' && (
                  <div className={`rounded-xl p-3 border space-y-1 ${COT_COLORS[selectedCot.estado]}`}>
                    <p className="text-sm font-semibold">{selectedCot.estado}</p>
                    {selectedCot.aprobadaPor && (
                      <p className="text-xs opacity-80">
                        {selectedCot.estado === 'APROBADA' ? 'Aprobada' : 'Rechazada'} por:{' '}
                        <span className="font-semibold">{selectedCot.aprobadaPor.name ?? selectedCot.aprobadaPor.email}</span>
                        {selectedCot.aprobadaEn && (
                          <> · {new Date(selectedCot.aprobadaEn).toLocaleString('es-PA', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</>
                        )}
                      </p>
                    )}
                    {selectedCot.notaAdmin && <p className="text-sm">{selectedCot.notaAdmin}</p>}
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
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

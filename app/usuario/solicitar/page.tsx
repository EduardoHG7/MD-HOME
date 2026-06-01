'use client'

import { useState, useEffect, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { formatDate, formatCurrency, TARIFA_LABELS, ESTADO_COLORS, ESTADO_SOLICITUD_LABELS } from '@/lib/utils'

const QrScanner = dynamic(() => import('@/components/QrScanner'), { ssr: false })

interface Evento   { id: string; nombre: string; fechaInicio: string; fechaFin: string }
interface Puesto   { id: string; nombre: string }
interface Tarifa   { id: string; tipo: string; precioPorDia: number }
interface Registro { id: string; tipo: string; timestamp: string }
interface Aplicante {
  id: string; nombreCompleto: string; cedula: string; telefono: string
  asignaciones?: { id: string }[]
}
interface Asignacion {
  id: string; funcion: string; eventoId: string
  aplicante: { id: string; nombreCompleto: string; cedula: string; telefono: string }
  registros: Registro[]
}
interface Solicitud {
  id: string; numPersonas: number; funcion: string; estado: string
  costoTotal: number | null; notaAdmin: string | null; createdAt: string
  evento: Evento; tarifa: Tarifa | null; asignaciones: Asignacion[]
}

function fmtTime(ts: string) {
  return new Date(ts).toLocaleString('es-PA', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
  })
}

function agruparPorDia(registros: Registro[]) {
  const dias: Record<string, { entrada?: Registro; salida?: Registro }> = {}
  for (const r of registros) {
    const dia = new Date(r.timestamp).toLocaleDateString('es-PA', { day: '2-digit', month: 'short', year: 'numeric' })
    if (!dias[dia]) dias[dia] = {}
    if (r.tipo === 'ENTRADA' && !dias[dia].entrada) dias[dia].entrada = r
    if (r.tipo === 'SALIDA'  && !dias[dia].salida)  dias[dia].salida  = r
  }
  return Object.entries(dias)
}

export default function SolicitarPage() {
  const [eventos,     setEventos]     = useState<Evento[]>([])
  const [puestos,     setPuestos]     = useState<Puesto[]>([])
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([])
  const [showForm,    setShowForm]    = useState(false)
  const [loading,     setLoading]     = useState(false)
  const [success,     setSuccess]     = useState(false)
  const [error,       setError]       = useState('')

  // Detalle expandido
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Asignación
  const [asigExpId,  setAsigExpId]  = useState<string | null>(null)
  const [aplicantes, setAplicantes] = useState<Aplicante[]>([])
  const [busqueda,   setBusqueda]   = useState('')
  const [buscando,   setBuscando]   = useState(false)
  const [asignando,  setAsignando]  = useState<string | null>(null)

  // Link y scanner
  const [copiedId,   setCopiedId]   = useState<string | null>(null)
  const [scanning,   setScanning]   = useState(false)
  const [scanResult, setScanResult] = useState<{ ok: boolean; msg: string } | null>(null)

  const [form, setForm] = useState({ eventoId: '', numPersonas: 1, funcion: '', funcionCustom: '' })

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

  function reloadSolicitudes() {
    fetch('/api/solicitudes').then(r => r.json()).then(d => {
      if (Array.isArray(d)) setSolicitudes(d)
    })
  }

  // Buscar aplicantes
  const buscarAplicantes = useCallback(async (q: string, eventoId: string) => {
    setBuscando(true)
    const res = await fetch(`/api/aplicantes/disponibles?q=${encodeURIComponent(q)}&eventoId=${eventoId}`)
    const data = await res.json()
    setAplicantes(Array.isArray(data) ? data : [])
    setBuscando(false)
  }, [])

  useEffect(() => {
    if (!asigExpId) return
    const sol = solicitudes.find(s => s.id === asigExpId)
    if (!sol) return
    const timer = setTimeout(() => buscarAplicantes(busqueda, sol.evento.id), 300)
    return () => clearTimeout(timer)
  }, [busqueda, asigExpId, solicitudes, buscarAplicantes])

  function toggleAsigPanel(id: string) {
    if (asigExpId === id) { setAsigExpId(null); setBusqueda(''); setAplicantes([]) }
    else {
      setAsigExpId(id); setBusqueda('')
      const sol = solicitudes.find(s => s.id === id)
      if (sol) buscarAplicantes('', sol.evento.id)
    }
  }

  async function asignar(solicitud: Solicitud, aplicanteId: string) {
    setAsignando(aplicanteId)
    const res = await fetch('/api/asignaciones', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ aplicanteId, eventoId: solicitud.evento.id, solicitudId: solicitud.id, funcion: solicitud.funcion }),
    })
    if (res.ok) {
      const nueva = await res.json()
      setSolicitudes(prev => prev.map(s => s.id === solicitud.id
        ? { ...s, asignaciones: [...(s.asignaciones ?? []), nueva] } : s))
      setAplicantes(prev => prev.map(a => a.id === aplicanteId ? { ...a, asignaciones: [{ id: nueva.id }] } : a))
    }
    setAsignando(null)
  }

  async function desasignar(solicitudId: string, asignacionId: string) {
    const res = await fetch('/api/asignaciones', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ asignacionId, solicitudId }),
    })
    if (res.ok) {
      setSolicitudes(prev => prev.map(s => s.id === solicitudId
        ? { ...s, asignaciones: (s.asignaciones ?? []).filter(a => a.id !== asignacionId) } : s))
    }
  }

  function copiarLink(aplicanteId: string, eventoId: string) {
    const url = `${window.location.origin}/aplicante/${aplicanteId}?evento=${eventoId}`
    navigator.clipboard.writeText(url)
    setCopiedId(aplicanteId)
    setTimeout(() => setCopiedId(null), 2000)
  }

  async function handleQrResult(text: string) {
    setScanning(false)
    try {
      const url = new URL(text)
      const res = await fetch(url.pathname + url.search)
      const html = await res.text()
      const isOk = html.includes('exitosamente') || html.includes('registrad')
      setScanResult({ ok: isOk, msg: isOk ? '✅ Asistencia registrada correctamente' : '⚠️ No se pudo registrar — token expirado o ya usado' })
      if (isOk) setTimeout(reloadSolicitudes, 1500)
    } catch {
      setScanResult({ ok: false, msg: '❌ QR inválido — no corresponde a este sistema' })
    }
    setTimeout(() => setScanResult(null), 5000)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setError('')
    if (!form.eventoId) { setError('Selecciona un evento.'); return }
    const funcion = form.funcion === 'OTRO' ? form.funcionCustom.trim() : form.funcion
    if (!funcion) { setError('Indica la función.'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/solicitudes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventoId: form.eventoId, numPersonas: form.numPersonas, funcion }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Error al enviar.'); return }
      setSolicitudes(prev => [{ ...data, asignaciones: [] }, ...prev])
      setSuccess(true); setForm({ eventoId: '', numPersonas: 1, funcion: '', funcionCustom: '' }); setShowForm(false)
      setTimeout(() => setSuccess(false), 4000)
    } catch { setError('Error de conexión.') }
    finally { setLoading(false) }
  }

  const pendientes = solicitudes.filter(s => s.estado === 'PENDIENTE').length
  const aprobadas  = solicitudes.filter(s => s.estado === 'APROBADA').length

  return (
    <div className="space-y-6">
      {/* Scanner modal */}
      {scanning && (
        <QrScanner onResult={handleQrResult} onClose={() => setScanning(false)} />
      )}

      {/* Resultado escaneo */}
      {scanResult && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-40 px-6 py-3 rounded-2xl shadow-lg text-sm font-semibold ${
          scanResult.ok ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
        }`}>
          {scanResult.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Solicitudes de Personal</h1>
          <p className="text-gray-500 mt-1">Gestiona tus solicitudes y asigna personal</p>
        </div>
        <button onClick={() => { setShowForm(v => !v); setError('') }} className="btn-primary">
          {showForm ? '✕ Cancelar' : '+ Nueva Solicitud'}
        </button>
      </div>

      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 rounded-xl px-4 py-3 text-sm">
          ✓ Solicitud enviada. El administrador la revisará y asignará la tarifa.
        </div>
      )}

      {/* Formulario */}
      {showForm && (
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-5">Nueva Solicitud</h2>
          {error && <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl px-4 py-3 mb-4 text-sm">{error}</div>}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Evento *</label>
              <select className="input" value={form.eventoId} onChange={e => setForm(f => ({ ...f, eventoId: e.target.value }))} required>
                <option value="">Seleccionar evento...</option>
                {eventos.map(ev => <option key={ev.id} value={ev.id}>{ev.nombre} — {formatDate(ev.fechaInicio)}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Cantidad de personas *</label>
              <input type="number" min={1} max={500} className="input" value={form.numPersonas}
                onChange={e => setForm(f => ({ ...f, numPersonas: parseInt(e.target.value) || 1 }))} required />
            </div>
            <div>
              <label className="label">Función *</label>
              <select className="input" value={form.funcion} onChange={e => setForm(f => ({ ...f, funcion: e.target.value }))} required>
                <option value="">Seleccionar función...</option>
                {puestos.map(p => <option key={p.id} value={p.nombre}>{p.nombre}</option>)}
                <option value="OTRO">Otro (especificar)</option>
              </select>
              {form.funcion === 'OTRO' && (
                <input className="input mt-2" placeholder="Describe la función..."
                  value={form.funcionCustom} onChange={e => setForm(f => ({ ...f, funcionCustom: e.target.value }))} />
              )}
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700">
              💡 El administrador asignará la tarifa al revisar tu solicitud.
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? 'Enviando...' : 'Enviar Solicitud'}
            </button>
          </form>
        </div>
      )}

      {/* Resumen */}
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

      {/* Lista */}
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
            {solicitudes.map(s => {
              const isExpanded = expandedId === s.id
              const asigs = s.asignaciones ?? []
              return (
                <div key={s.id} className="card overflow-hidden">
                  {/* Cabecera clickeable */}
                  <button
                    className="w-full text-left p-5 hover:bg-gray-50 transition-colors"
                    onClick={() => setExpandedId(isExpanded ? null : s.id)}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900">{s.evento.nombre}</p>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500 mt-1">
                          <span>👤 {s.numPersonas} persona(s)</span>
                          <span>🔧 {s.funcion}</span>
                          <span>📅 {formatDate(s.createdAt)}</span>
                        </div>
                        {s.estado === 'APROBADA' && (
                          <p className="text-xs text-gray-400 mt-1">
                            Personal: {asigs.length}/{s.numPersonas}
                            {asigs.length >= s.numPersonas
                              ? <span className="text-green-600 ml-1">✓ Completo</span>
                              : <span className="text-amber-500 ml-1">({s.numPersonas - asigs.length} pendiente{s.numPersonas - asigs.length !== 1 ? 's' : ''})</span>}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`badge ${ESTADO_COLORS[s.estado]}`}>
                          {ESTADO_SOLICITUD_LABELS[s.estado]}
                        </span>
                        <span className="text-gray-400 text-sm">{isExpanded ? '▲' : '▼'}</span>
                      </div>
                    </div>
                  </button>

                  {/* Detalle expandido */}
                  {isExpanded && (
                    <div className="border-t border-gray-100 bg-gray-50 p-5 space-y-5">

                      {/* Info del evento */}
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div className="bg-white rounded-xl p-3 border border-gray-100">
                          <p className="text-xs text-gray-400 mb-0.5">Fechas del evento</p>
                          <p className="font-medium text-gray-900">{formatDate(s.evento.fechaInicio)} – {formatDate(s.evento.fechaFin)}</p>
                        </div>
                        {s.tarifa && (
                          <div className="bg-white rounded-xl p-3 border border-gray-100">
                            <p className="text-xs text-gray-400 mb-0.5">Tarifa asignada</p>
                            <p className="font-medium text-gray-900">{TARIFA_LABELS[s.tarifa.tipo]} · {formatCurrency(s.tarifa.precioPorDia)}/día</p>
                          </div>
                        )}
                        {s.costoTotal && (
                          <div className="bg-white rounded-xl p-3 border border-gray-100">
                            <p className="text-xs text-gray-400 mb-0.5">Costo aprobado</p>
                            <p className="font-bold text-green-600">{formatCurrency(s.costoTotal)}</p>
                          </div>
                        )}
                        {s.notaAdmin && (
                          <div className="bg-white rounded-xl p-3 border border-gray-100 col-span-2">
                            <p className="text-xs text-gray-400 mb-0.5">Nota del admin</p>
                            <p className="text-gray-700 italic">&quot;{s.notaAdmin}&quot;</p>
                          </div>
                        )}
                      </div>

                      {/* Personal asignado */}
                      {s.estado === 'APROBADA' && (
                        <div>
                          <div className="flex items-center justify-between mb-3">
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                              Personal asignado ({asigs.length}/{s.numPersonas})
                            </p>
                            <div className="flex gap-2">
                              <button
                                onClick={() => { setScanning(true) }}
                                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl border-2 border-gray-900 bg-gray-900 text-white font-medium hover:bg-gray-700 transition-all"
                              >
                                📷 Escanear QR
                              </button>
                              <button
                                onClick={() => toggleAsigPanel(s.id)}
                                className="text-xs px-3 py-1.5 rounded-xl border-2 border-gray-200 text-gray-600 hover:border-gray-400 font-medium transition-all"
                              >
                                {asigExpId === s.id ? '✕ Cerrar' : '+ Asignar'}
                              </button>
                            </div>
                          </div>

                          {/* Lista de asignados */}
                          {asigs.length > 0 ? (
                            <div className="space-y-2">
                              {asigs.map(a => {
                                const dias = agruparPorDia(a.registros ?? [])
                                return (
                                  <div key={a.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                                    {/* Cabecera */}
                                    <div className="flex items-center justify-between px-4 py-3">
                                      <div>
                                        <p className="font-medium text-gray-900 text-sm">{a.aplicante.nombreCompleto}</p>
                                        <p className="text-gray-400 text-xs">Cédula: {a.aplicante.cedula} · Tel: {a.aplicante.telefono}</p>
                                      </div>
                                      <div className="flex gap-2">
                                        <button
                                          onClick={() => copiarLink(a.aplicante.id, s.evento.id)}
                                          className={`text-xs px-2 py-1 rounded-lg border font-medium transition-all ${
                                            copiedId === a.aplicante.id
                                              ? 'border-green-300 bg-green-50 text-green-600'
                                              : 'border-gray-200 text-gray-600 hover:border-gray-400'
                                          }`}
                                        >
                                          {copiedId === a.aplicante.id ? '✓' : '🔗'}
                                        </button>
                                        <button onClick={reloadSolicitudes} className="text-gray-400 hover:text-gray-600 text-xs px-2 py-1 rounded-lg hover:bg-gray-100" title="Actualizar">↻</button>
                                        <button onClick={() => desasignar(s.id, a.id)} className="text-red-400 hover:text-red-600 text-xs px-2 py-1 rounded-lg hover:bg-red-50">✕</button>
                                      </div>
                                    </div>
                                    {/* Registros por día */}
                                    {dias.length === 0 ? (
                                      <div className="px-4 py-2 bg-gray-50 border-t border-gray-100">
                                        <span className="text-gray-300 text-xs">Sin registros aún</span>
                                      </div>
                                    ) : (
                                      <div className="border-t border-gray-100 divide-y divide-gray-100">
                                        {dias.map(([dia, rec]) => (
                                          <div key={dia} className="flex items-center gap-3 px-4 py-1.5 bg-gray-50 text-xs">
                                            <span className="text-gray-500 font-semibold w-20 shrink-0">{dia}</span>
                                            <span className={rec.entrada ? 'text-green-600 font-medium' : 'text-gray-300'}>
                                              ↓ {rec.entrada ? new Date(rec.entrada.timestamp).toLocaleTimeString('es-PA',{hour:'2-digit',minute:'2-digit'}) : '—'}
                                            </span>
                                            <span className={rec.salida ? 'text-blue-600 font-medium' : 'text-gray-300'}>
                                              ↑ {rec.salida ? new Date(rec.salida.timestamp).toLocaleTimeString('es-PA',{hour:'2-digit',minute:'2-digit'}) : '—'}
                                            </span>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          ) : (
                            <div className="bg-white rounded-xl border border-dashed border-gray-300 p-4 text-center">
                              <p className="text-gray-400 text-sm">Sin personal asignado aún</p>
                            </div>
                          )}

                          {/* Panel buscar/asignar */}
                          {asigExpId === s.id && asigs.length < s.numPersonas && (
                            <div className="mt-3 p-4 bg-white rounded-xl border border-gray-200 space-y-3">
                              <input
                                className="input"
                                placeholder="Buscar aplicante por nombre o cédula..."
                                value={busqueda}
                                onChange={e => setBusqueda(e.target.value)}
                              />
                              {buscando ? (
                                <p className="text-gray-400 text-sm text-center py-2">Buscando...</p>
                              ) : aplicantes.length === 0 ? (
                                <p className="text-gray-400 text-sm text-center py-2">No se encontraron aplicantes</p>
                              ) : (
                                <div className="space-y-2 max-h-52 overflow-y-auto">
                                  {aplicantes.map(a => {
                                    const yaAsig = (a.asignaciones?.length ?? 0) > 0
                                    return (
                                      <div key={a.id} className={`flex items-center justify-between px-3 py-2 rounded-xl border transition-all ${yaAsig ? 'border-green-200 opacity-60' : 'border-gray-200'}`}>
                                        <div>
                                          <p className="font-medium text-gray-900 text-sm">{a.nombreCompleto}</p>
                                          <p className="text-gray-400 text-xs">{a.cedula} · {a.telefono}</p>
                                        </div>
                                        {yaAsig
                                          ? <span className="text-green-600 text-xs font-medium">✓ Asignado</span>
                                          : <button onClick={() => asignar(s, a.id)} disabled={asignando === a.id} className="btn-primary text-xs py-1 px-3">
                                              {asignando === a.id ? '...' : '+ Asignar'}
                                            </button>
                                        }
                                      </div>
                                    )
                                  })}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

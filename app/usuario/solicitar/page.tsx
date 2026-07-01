'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import dynamic from 'next/dynamic'
import { formatDate, formatCurrency, TARIFA_LABELS, ESTADO_COLORS, ESTADO_SOLICITUD_LABELS } from '@/lib/utils'

const QrScanner = dynamic(() => import('@/components/QrScanner'), { ssr: false })

// ── Caja Menuda interfaces ───────────────────────────────────────────────────
interface FacturaCM {
  id: string; descripcion: string | null; proveedor: string | null
  numeroFactura: string | null; rucDv: string | null; fechaEmision: string | null
  subtotal: number; itbms: number; total: number
  archivoNombre: string | null; archivoPath: string | null
}
interface CajaMenuda {
  id: string; descripcion: string; montoSolicitado: number; montoAprobado: number | null
  estado: string; notaAdmin: string | null; createdAt: string
  evento: { nombre: string }
  aprobadoPor: { name: string | null; email: string } | null
  facturas: FacturaCM[]
}
interface QueueItemCM {
  id: string; name: string; status: 'pending' | 'processing' | 'done' | 'error'
  result?: Omit<FacturaCM, 'id' | 'archivoPath'>; error?: string; _file?: File
}

const CM_ESTADO_COLORS: Record<string, string> = {
  PENDIENTE:            'bg-yellow-100 text-yellow-700 border-yellow-200',
  APROBADA:             'bg-green-100 text-green-700 border-green-200',
  RECHAZADA:            'bg-red-100 text-red-600 border-red-200',
  RESPALDOS_ENTREGADOS: 'bg-blue-100 text-blue-700 border-blue-200',
  PAGADA:               'bg-purple-100 text-purple-700 border-purple-200',
}
const CM_ESTADO_LABELS: Record<string, string> = {
  PENDIENTE:            'Pendiente',
  APROBADA:             'Aprobada',
  RECHAZADA:            'Rechazada',
  RESPALDOS_ENTREGADOS: 'Respaldos entregados',
  PAGADA:               'Pagada',
}

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
  fechaInicioLabor: string | null; fechaFinLabor: string | null
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
  const [mainTab, setMainTab] = useState<'personal' | 'caja_menuda'>('personal')

  const [eventos,     setEventos]     = useState<Evento[]>([])
  const [puestos,     setPuestos]     = useState<Puesto[]>([])
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([])
  const [showForm,    setShowForm]    = useState(false)
  const [loading,     setLoading]     = useState(false)
  const [success,     setSuccess]     = useState(false)
  const [error,       setError]       = useState('')

  // ── Caja Menuda state ──
  const [cajasMenuda,   setCajasMenuda]   = useState<CajaMenuda[]>([])
  const [showCMForm,    setShowCMForm]    = useState(false)
  const [cmLoading,     setCmLoading]     = useState(false)
  const [cmError,       setCmError]       = useState('')
  const [cmSuccess,     setCmSuccess]     = useState(false)
  const [cmForm,        setCmForm]        = useState({ eventoId: '', montoSolicitado: '', descripcion: '' })
  const [expandedCMId,  setExpandedCMId]  = useState<string | null>(null)
  const [uploadingCM,   setUploadingCM]   = useState<string | null>(null) // cajaMenudaId being uploaded
  const [cmQueue,       setCmQueue]       = useState<QueueItemCM[]>([])
  const [savingCM,      setSavingCM]      = useState(false)
  const cmFileRef = useRef<HTMLInputElement>(null)

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
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [reenvioId,  setReenvioId]  = useState<string | null>(null)

  const [form, setForm] = useState({ eventoId: '', numPersonas: 1, funcion: '', funcionCustom: '', fechaInicioLabor: '', fechaFinLabor: '', presupuesto: '', comentario: '' })

  useEffect(() => {
    Promise.all([
      fetch('/api/eventos').then(r => r.json()),
      fetch('/api/puestos').then(r => r.json()),
      fetch('/api/solicitudes').then(r => r.json()),
      fetch('/api/caja-menuda').then(r => r.json()),
    ]).then(([ev, pu, sol, cm]) => {
      setEventos(Array.isArray(ev) ? ev : [])
      setPuestos(Array.isArray(pu) ? pu : [])
      setSolicitudes(Array.isArray(sol) ? sol : [])
      setCajasMenuda(Array.isArray(cm) ? cm : [])
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

  async function eliminarSolicitud(id: string) {
    if (!confirm('¿Seguro que quieres eliminar esta solicitud?')) return
    setDeletingId(id)
    const res = await fetch(`/api/solicitudes/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setSolicitudes(prev => prev.filter(s => s.id !== id))
      if (expandedId === id) setExpandedId(null)
    }
    setDeletingId(null)
  }

  async function reenviarSolicitud(id: string) {
    setReenvioId(id)
    const res = await fetch(`/api/solicitudes/${id}`, { method: 'POST' })
    if (res.ok) {
      setScanResult({ ok: true, msg: '✅ Solicitud reenviada a los administradores' })
      setTimeout(() => setScanResult(null), 4000)
    }
    setReenvioId(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setError('')
    if (!form.eventoId) { setError('Selecciona un evento.'); return }
    const funcion = form.funcion === 'OTRO' ? form.funcionCustom.trim() : form.funcion
    if (!funcion) { setError('Indica la función.'); return }
    if (!form.fechaInicioLabor || !form.fechaFinLabor) { setError('Indica las fechas de labor.'); return }
    if (form.fechaFinLabor < form.fechaInicioLabor) { setError('La fecha de fin no puede ser antes de la de inicio.'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/solicitudes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventoId: form.eventoId, numPersonas: form.numPersonas, funcion,
          fechaInicioLabor: form.fechaInicioLabor,
          fechaFinLabor:    form.fechaFinLabor,
          presupuesto:      form.presupuesto || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Error al enviar.'); return }
      setSolicitudes(prev => [{ ...data, asignaciones: [] }, ...prev])
      setSuccess(true); setForm({ eventoId: '', numPersonas: 1, funcion: '', funcionCustom: '', fechaInicioLabor: '', fechaFinLabor: '', presupuesto: '', comentario: '' }); setShowForm(false)
      setTimeout(() => setSuccess(false), 4000)
    } catch { setError('Error de conexión.') }
    finally { setLoading(false) }
  }

  // ── Caja Menuda handlers ──────────────────────────────────────────────────

  async function handleCMSubmit(e: React.FormEvent) {
    e.preventDefault(); setCmError('')
    if (!cmForm.eventoId) { setCmError('Selecciona un evento.'); return }
    if (!cmForm.montoSolicitado || parseFloat(cmForm.montoSolicitado) <= 0) { setCmError('Ingresa un monto válido.'); return }
    if (!cmForm.descripcion.trim()) { setCmError('Describe en qué se usará el dinero.'); return }
    setCmLoading(true)
    try {
      const res = await fetch('/api/caja-menuda', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventoId: cmForm.eventoId, montoSolicitado: parseFloat(cmForm.montoSolicitado), descripcion: cmForm.descripcion }),
      })
      const data = await res.json()
      if (!res.ok) { setCmError(data.error ?? 'Error al enviar.'); return }
      setCajasMenuda(prev => [data, ...prev])
      setCmSuccess(true); setCmForm({ eventoId: '', montoSolicitado: '', descripcion: '' }); setShowCMForm(false)
      setTimeout(() => setCmSuccess(false), 4000)
    } catch { setCmError('Error de conexión.') }
    finally { setCmLoading(false) }
  }

  function fileToBase64CM(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload  = () => resolve((reader.result as string).split(',')[1])
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  function addCMFiles(cajaId: string, files: FileList | File[]) {
    const allowed = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp']
    const items: QueueItemCM[] = Array.from(files)
      .filter(f => allowed.includes(f.type))
      .map(f => ({ id: crypto.randomUUID(), name: f.name, status: 'pending', _file: f }))
    if (!items.length) return
    setCmQueue(prev => [...prev, ...items])
    processCMQueue(cajaId, items)
  }

  async function processCMQueue(cajaId: string, items: QueueItemCM[]) {
    for (const item of items) {
      setCmQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: 'processing' } : q))
      try {
        const base64 = await fileToBase64CM(item._file!)
        // Extract data
        const extRes = await fetch('/api/facturas/extract', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ base64, mimeType: item._file!.type, fileName: item.name }),
        })
        const extData = await extRes.json()
        if (!extRes.ok) throw new Error(extData.error ?? 'Error extrayendo datos')
        // Upload to SharePoint + save
        const saveRes = await fetch(`/api/caja-menuda/${cajaId}/facturas`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            base64, mimeType: item._file!.type, fileName: item.name,
            descripcion:   extData.descripcion   ?? null,
            proveedor:     extData.proveedor      ?? null,
            numeroFactura: extData.numero_factura ?? null,
            rucDv:         extData.ruc_dv         ?? null,
            fechaEmision:  extData.fecha_emision  ?? null,
            subtotal:      extData.subtotal        ?? 0,
            itbms:         extData.itbms           ?? 0,
            total:         extData.total           ?? 0,
          }),
        })
        const saved = await saveRes.json()
        if (!saveRes.ok) throw new Error(saved.error ?? 'Error guardando')
        setCmQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: 'done', result: saved } : q))
        setCajasMenuda(prev => prev.map(c => c.id === cajaId
          ? { ...c, facturas: [...c.facturas, saved] } : c))
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Error'
        setCmQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: 'error', error: msg } : q))
      }
    }
  }

  async function deleteCMFactura(cajaId: string, factId: string) {
    const res = await fetch(`/api/caja-menuda/${cajaId}/facturas/${factId}`, { method: 'DELETE' })
    if (res.ok) {
      setCajasMenuda(prev => prev.map(c => c.id === cajaId
        ? { ...c, facturas: c.facturas.filter(f => f.id !== factId) } : c))
      setCmQueue(prev => prev.filter(q => (q.result as FacturaCM | undefined)?.id !== factId))
    }
  }

  async function guardarRespaldosCM(cajaId: string) {
    setSavingCM(true)
    const res = await fetch(`/api/caja-menuda/${cajaId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado: 'RESPALDOS_ENTREGADOS' }),
    })
    if (res.ok) {
      const updated = await res.json()
      setCajasMenuda(prev => prev.map(c => c.id === cajaId ? { ...c, ...updated } : c))
      setCmQueue([])
      setUploadingCM(null)
    }
    setSavingCM(false)
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
          <h1 className="text-2xl font-bold text-gray-900">Solicitudes</h1>
          <p className="text-gray-500 mt-1">Gestiona tus solicitudes y asigna personal</p>
        </div>
        {mainTab === 'personal' && (
          <button onClick={() => { setShowForm(v => !v); setError('') }} className="btn-primary">
            {showForm ? '✕ Cancelar' : '+ Nueva Solicitud'}
          </button>
        )}
        {mainTab === 'caja_menuda' && (
          <button onClick={() => { setShowCMForm(v => !v); setCmError('') }} className="btn-primary">
            {showCMForm ? '✕ Cancelar' : '+ Nueva Caja Menuda'}
          </button>
        )}
      </div>

      {/* Main tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-2xl p-1 w-fit">
        <button onClick={() => setMainTab('personal')}
          className={`px-5 py-2 rounded-xl text-sm font-medium transition-all ${mainTab === 'personal' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
          👥 Personal
        </button>
        <button onClick={() => setMainTab('caja_menuda')}
          className={`px-5 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-2 ${mainTab === 'caja_menuda' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
          💰 Caja Menuda
          {cajasMenuda.filter(c => c.estado === 'PENDIENTE').length > 0 && (
            <span className="bg-amber-400 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">
              {cajasMenuda.filter(c => c.estado === 'PENDIENTE').length}
            </span>
          )}
        </button>
      </div>

      {/* ══ TAB: CAJA MENUDA ══ */}
      {mainTab === 'caja_menuda' && (
        <div className="space-y-5">
          {cmSuccess && (
            <div className="bg-green-50 border border-green-200 text-green-700 rounded-xl px-4 py-3 text-sm">
              ✓ Solicitud de caja menuda enviada. El administrador la revisará pronto.
            </div>
          )}

          {/* Formulario nueva caja menuda */}
          {showCMForm && (
            <div className="card p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Nueva Solicitud de Caja Menuda</h2>
              {cmError && <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl px-4 py-3 mb-4 text-sm">{cmError}</div>}
              <form onSubmit={handleCMSubmit} className="space-y-4">
                <div>
                  <label className="label">Evento *</label>
                  <select className="input" value={cmForm.eventoId} onChange={e => setCmForm(f => ({ ...f, eventoId: e.target.value }))} required>
                    <option value="">Seleccionar evento...</option>
                    {eventos.map(ev => <option key={ev.id} value={ev.id}>{ev.nombre} — {formatDate(ev.fechaInicio)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Monto a solicitar ($) *</label>
                  <input type="number" step="0.01" min="0.01" className="input" placeholder="Ej: 250.00"
                    value={cmForm.montoSolicitado} onChange={e => setCmForm(f => ({ ...f, montoSolicitado: e.target.value }))} required />
                </div>
                <div>
                  <label className="label">¿En qué se usará el dinero? *</label>
                  <textarea className="input resize-none h-24" placeholder="Describe brevemente los gastos planificados..."
                    value={cmForm.descripcion} onChange={e => setCmForm(f => ({ ...f, descripcion: e.target.value }))} required />
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700">
                  💡 Una vez aprobada, podrás subir las facturas como respaldo de los gastos.
                </div>
                <button type="submit" disabled={cmLoading} className="btn-primary w-full">
                  {cmLoading ? 'Enviando...' : 'Enviar Solicitud'}
                </button>
              </form>
            </div>
          )}

          {/* Lista cajas menuda */}
          {cajasMenuda.length === 0 ? (
            <div className="card p-10 text-center">
              <p className="text-4xl mb-3">💰</p>
              <p className="text-gray-700 font-semibold">No tienes solicitudes de caja menuda</p>
              <p className="text-gray-400 text-sm mt-1">Haz click en &quot;+ Nueva Caja Menuda&quot; para comenzar</p>
            </div>
          ) : (
            <div className="space-y-3">
              {cajasMenuda.map(c => {
                const isExpanded = expandedCMId === c.id
                const totalFacturas = c.facturas.reduce((s, f) => s + f.total, 0)
                const monto = c.montoAprobado ?? 0
                const diff  = monto - totalFacturas
                return (
                  <div key={c.id} className="card overflow-hidden">
                    <button className="w-full text-left p-5 hover:bg-gray-50 transition-colors"
                      onClick={() => setExpandedCMId(isExpanded ? null : c.id)}>
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-gray-900">{c.evento.nombre}</p>
                          <p className="text-gray-500 text-sm mt-1">{c.descripcion}</p>
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400 mt-1">
                            <span>Solicitado: <strong>${c.montoSolicitado.toFixed(2)}</strong></span>
                            {c.montoAprobado && <span>Aprobado: <strong className="text-green-600">${c.montoAprobado.toFixed(2)}</strong></span>}
                            <span>{formatDate(c.createdAt)}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`badge border ${CM_ESTADO_COLORS[c.estado]}`}>{CM_ESTADO_LABELS[c.estado]}</span>
                          <span className="text-gray-400 text-sm">{isExpanded ? '▲' : '▼'}</span>
                        </div>
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="border-t border-gray-100 bg-gray-50 p-5 space-y-4">
                        {/* Info */}
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div className="bg-white rounded-xl p-3 border border-gray-100">
                            <p className="text-xs text-gray-400 mb-0.5">Monto solicitado</p>
                            <p className="font-bold text-gray-900">${c.montoSolicitado.toFixed(2)}</p>
                          </div>
                          {c.montoAprobado && (
                            <div className="bg-white rounded-xl p-3 border border-gray-100">
                              <p className="text-xs text-gray-400 mb-0.5">Monto aprobado</p>
                              <p className="font-bold text-green-600">${c.montoAprobado.toFixed(2)}</p>
                            </div>
                          )}
                          {c.notaAdmin && (
                            <div className="bg-white rounded-xl p-3 border border-gray-100 col-span-2">
                              <p className="text-xs text-gray-400 mb-0.5">Nota del admin</p>
                              <p className="text-gray-700 italic">&quot;{c.notaAdmin}&quot;</p>
                            </div>
                          )}
                        </div>

                        {/* Respaldos: solo si está aprobada */}
                        {(c.estado === 'APROBADA' || c.estado === 'RESPALDOS_ENTREGADOS') && c.montoAprobado && (
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Facturas / Respaldos</p>
                              {c.estado === 'APROBADA' && (
                                <button
                                  onClick={() => { setUploadingCM(c.id); setCmQueue([]) }}
                                  className="text-xs px-3 py-1.5 rounded-xl border-2 border-gray-200 text-gray-600 hover:border-gray-400 font-medium transition-all">
                                  + Agregar facturas
                                </button>
                              )}
                            </div>

                            {/* Upload area */}
                            {uploadingCM === c.id && (
                              <div className="space-y-3">
                                <div
                                  className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center cursor-pointer hover:border-gray-400 transition-all"
                                  onClick={() => cmFileRef.current?.click()}
                                  onDragOver={e => e.preventDefault()}
                                  onDrop={e => { e.preventDefault(); addCMFiles(c.id, e.dataTransfer.files) }}>
                                  <p className="text-gray-500 text-sm">📎 Arrastra archivos o haz click para seleccionar</p>
                                  <p className="text-gray-400 text-xs mt-1">PDF, JPG, PNG, WEBP</p>
                                </div>
                                <input ref={cmFileRef} type="file" multiple accept=".pdf,image/*" className="hidden"
                                  onChange={e => e.target.files && addCMFiles(c.id, e.target.files)} />

                                {/* Queue */}
                                {cmQueue.length > 0 && (
                                  <div className="space-y-1">
                                    {cmQueue.map(q => (
                                      <div key={q.id} className="flex items-center gap-3 bg-white rounded-xl border border-gray-200 px-3 py-2 text-sm">
                                        <span className="text-lg">
                                          {q.status === 'pending'    ? '⏳' :
                                           q.status === 'processing' ? '⚙️' :
                                           q.status === 'done'       ? '✅' : '❌'}
                                        </span>
                                        <span className="flex-1 truncate text-gray-700">{q.name}</span>
                                        {q.status === 'done' && q.result && (
                                          <span className="text-green-600 font-semibold text-xs">${(q.result as FacturaCM).total.toFixed(2)}</span>
                                        )}
                                        {q.status === 'error' && <span className="text-red-500 text-xs">{q.error}</span>}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Tabla facturas */}
                            {c.facturas.length > 0 && (
                              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="bg-gray-50 text-gray-400 border-b border-gray-100">
                                      <th className="px-3 py-2 text-left">Descripción</th>
                                      <th className="px-3 py-2 text-left">Proveedor</th>
                                      <th className="px-3 py-2 text-right">Subtotal</th>
                                      <th className="px-3 py-2 text-right">ITBMS</th>
                                      <th className="px-3 py-2 text-right">Total</th>
                                      <th className="px-3 py-2 text-center">Doc</th>
                                      {c.estado === 'APROBADA' && <th className="px-3 py-2"></th>}
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-50">
                                    {c.facturas.map(f => (
                                      <tr key={f.id} className="hover:bg-gray-50">
                                        <td className="px-3 py-2 text-gray-700">{f.descripcion ?? '—'}</td>
                                        <td className="px-3 py-2 text-gray-500">{f.proveedor ?? '—'}</td>
                                        <td className="px-3 py-2 text-right">${f.subtotal.toFixed(2)}</td>
                                        <td className="px-3 py-2 text-right">${f.itbms.toFixed(2)}</td>
                                        <td className="px-3 py-2 text-right font-semibold">${f.total.toFixed(2)}</td>
                                        <td className="px-3 py-2 text-center">
                                          {f.archivoPath ? (
                                            <a href={`/api/fotos?path=${encodeURIComponent(f.archivoPath)}`} target="_blank" rel="noopener noreferrer"
                                              className="text-blue-500 hover:underline">Ver</a>
                                          ) : '—'}
                                        </td>
                                        {c.estado === 'APROBADA' && (
                                          <td className="px-3 py-2">
                                            <button onClick={() => deleteCMFactura(c.id, f.id)}
                                              className="text-red-400 hover:text-red-600 text-xs">✕</button>
                                          </td>
                                        )}
                                      </tr>
                                    ))}
                                  </tbody>
                                  <tfoot>
                                    <tr className="bg-gray-50 font-semibold border-t border-gray-200">
                                      <td className="px-3 py-2 text-gray-500" colSpan={4}>Total gastado</td>
                                      <td className="px-3 py-2 text-right text-gray-900">${totalFacturas.toFixed(2)}</td>
                                      <td colSpan={c.estado === 'APROBADA' ? 2 : 1}></td>
                                    </tr>
                                  </tfoot>
                                </table>

                                {/* Alerta de diferencia */}
                                {c.facturas.length > 0 && (() => {
                                  if (diff > 0.005) return (
                                    <div className="mx-3 mb-3 mt-1 bg-green-50 border border-green-200 rounded-xl px-4 py-2.5 text-sm text-green-700 flex justify-between items-center">
                                      <span>✅ Ahorro</span>
                                      <span className="font-bold">${diff.toFixed(2)}</span>
                                    </div>
                                  )
                                  if (diff < -0.005) return (
                                    <div className="mx-3 mb-3 mt-1 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 text-sm text-red-700 flex justify-between items-center">
                                      <span>❌ Excedido en</span>
                                      <span className="font-bold">${Math.abs(diff).toFixed(2)}</span>
                                    </div>
                                  )
                                  return (
                                    <div className="mx-3 mb-3 mt-1 bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-2.5 text-sm text-yellow-700 text-center font-medium">
                                      🟡 Monto exacto — sin diferencia
                                    </div>
                                  )
                                })()}
                              </div>
                            )}

                            {/* Botón guardar respaldos */}
                            {c.estado === 'APROBADA' && c.facturas.length > 0 && (
                              <button onClick={() => guardarRespaldosCM(c.id)} disabled={savingCM}
                                className="w-full btn-primary">
                                {savingCM ? 'Guardando...' : '✓ Guardar y entregar respaldos'}
                              </button>
                            )}

                            {c.estado === 'RESPALDOS_ENTREGADOS' && (
                              <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-700">
                                ✅ Respaldos entregados. Contabilidad procesará el pago.
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
      )}

      {/* ══ TAB: PERSONAL ══ */}
      {mainTab === 'personal' && (<>

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
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Fecha inicio de labor *</label>
                <input type="date" className="input" required
                  value={form.fechaInicioLabor}
                  onChange={e => setForm(f => ({ ...f, fechaInicioLabor: e.target.value }))} />
              </div>
              <div>
                <label className="label">Fecha fin de labor *</label>
                <input type="date" className="input" required
                  value={form.fechaFinLabor}
                  onChange={e => setForm(f => ({ ...f, fechaFinLabor: e.target.value }))} />
              </div>
            </div>
            {form.fechaInicioLabor && form.fechaFinLabor && form.fechaFinLabor >= form.fechaInicioLabor && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-700">
                📅 Días de labor: <strong>
                  {Math.ceil((new Date(form.fechaFinLabor).getTime() - new Date(form.fechaInicioLabor).getTime()) / (1000*60*60*24)) + 1}
                </strong> día(s) · {form.numPersonas} persona(s)
              </div>
            )}
            <div>
              <label className="label">Presupuesto disponible (opcional) $</label>
              <input type="number" step="0.01" min="0" className="input"
                placeholder="Ej: 5000.00"
                value={form.presupuesto}
                onChange={e => setForm(f => ({ ...f, presupuesto: e.target.value }))} />
              <p className="text-gray-400 text-xs mt-1">El admin verá la ganancia estimada contra este presupuesto.</p>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700">
              💡 El administrador asignará la tarifa al revisar tu solicitud.
            </div>
            <div>
              <label className="label">Comentario (opcional)</label>
              <textarea
                className="input resize-none h-20"
                placeholder="Agrega cualquier detalle adicional para el administrador..."
                value={form.comentario}
                onChange={e => setForm(f => ({ ...f, comentario: e.target.value }))}
              />
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
                        {s.estado === 'PENDIENTE' && (
                          <>
                            <button
                              onClick={e => { e.stopPropagation(); reenviarSolicitud(s.id) }}
                              disabled={reenvioId === s.id}
                              title="Reenviar a administradores"
                              className="text-xs px-2 py-1 rounded-lg border border-blue-200 text-blue-500 hover:bg-blue-50 transition-all"
                            >
                              {reenvioId === s.id ? '...' : '↩ Reenviar'}
                            </button>
                            <button
                              onClick={e => { e.stopPropagation(); eliminarSolicitud(s.id) }}
                              disabled={deletingId === s.id}
                              title="Eliminar solicitud"
                              className="text-xs px-2 py-1 rounded-lg border border-red-200 text-red-400 hover:bg-red-50 transition-all"
                            >
                              {deletingId === s.id ? '...' : '🗑'}
                            </button>
                          </>
                        )}
                        {s.estado === 'RECHAZADA' && (
                          <button
                            onClick={e => {
                              e.stopPropagation()
                              // Pre-llenar el formulario con los datos de la solicitud rechazada
                              const funcion = puestos.some(p => p.nombre === s.funcion) ? s.funcion : 'OTRO'
                              setForm({
                                eventoId:        s.evento.id,
                                numPersonas:     s.numPersonas,
                                funcion,
                                funcionCustom:   funcion === 'OTRO' ? s.funcion : '',
                                fechaInicioLabor: s.fechaInicioLabor ? s.fechaInicioLabor.slice(0, 10) : '',
                                fechaFinLabor:    s.fechaFinLabor    ? s.fechaFinLabor.slice(0, 10)    : '',
                                presupuesto:     '',
                                comentario:      '',
                              })
                              setShowForm(true)
                              window.scrollTo({ top: 0, behavior: 'smooth' })
                            }}
                            title="Volver a solicitar con los mismos datos"
                            className="text-xs px-2 py-1 rounded-lg border border-indigo-200 text-indigo-500 hover:bg-indigo-50 transition-all font-medium"
                          >
                            ↩ Volver a solicitar
                          </button>
                        )}
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
      </>)}
    </div>
  )
}

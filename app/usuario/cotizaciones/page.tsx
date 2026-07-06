'use client'

import { useEffect, useRef, useState } from 'react'
import { formatDate } from '@/lib/utils'

interface CotFact    { id: string; descripcion: string; proveedor: string; monto: number }
interface Cotizacion {
  id: string; concepto: string | null; descripcion: string | null; estado: string; notaAdmin: string | null
  montoTotal: number; createdAt: string; facturas: CotFact[]
  archivoUrl: string | null; archivoNombreCot: string | null
  facturaSubida: boolean; facturaUrl: string | null
  facturaNumero: string | null; facturaProveedor: string | null
  facturaFechaEmision: string | null; facturaFechaPago: string | null
  facturaSubtotal: number | null; facturaItbms: number | null; facturaTotal: number | null
}
interface Linea {
  id: string; descripcion: string; nota: string | null; montoUsd: number
  cotizaciones: Cotizacion[]
  categoria: { nombre: string; presupuesto: { evento: { id: string; nombre: string; fechaInicio: string; estado: string } } }
}

const ESTADO_COLORS: Record<string, string> = {
  PENDIENTE: 'bg-yellow-100 text-yellow-700',
  APROBADA:  'bg-green-100 text-green-700',
  RECHAZADA: 'bg-red-100 text-red-600',
}
function fmt(n: number) { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(n) }

/* ── Formulario de nueva cotización — componente separado para evitar re-mount ── */
function NuevaCotizacionForm({ lineaId, conceptosExistentes, onCreated }: { lineaId: string; conceptosExistentes: string[]; onCreated: (cot: Cotizacion) => void }) {
  const [concepto,  setConcepto]  = useState('')
  const [desc,      setDesc]      = useState('')
  const [facturas,  setFacturas]  = useState([{ descripcion: '', proveedor: '', monto: '' }])
  const [archivo,   setArchivo]   = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error,     setError]     = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!concepto.trim()) { setError('El concepto es obligatorio (ej: Comida, Bebidas, Toldas...)'); return }
    if (facturas.some(f => !f.descripcion || !f.monto)) { setError('Completa todas las facturas'); return }
    setSubmitting(true); setError('')

    const res = await fetch('/api/cotizaciones', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lineaId, concepto: concepto.trim(), descripcion: desc || null,
        facturas: facturas.map(f => ({ descripcion: f.descripcion, proveedor: f.proveedor || null, monto: parseFloat(f.monto) || 0 })),
      }),
    })
    if (!res.ok) { setError('Error al enviar'); setSubmitting(false); return }
    const cot: Cotizacion = await res.json()

    // Subir archivo adjunto si hay uno
    if (archivo) {
      setUploading(true)
      const base64 = await new Promise<string>((ok, fail) => {
        const r = new FileReader(); r.onload = () => ok((r.result as string).split(',')[1]); r.onerror = fail; r.readAsDataURL(archivo)
      })
      await fetch(`/api/cotizaciones/${cot.id}/archivo`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64, mimeType: archivo.type, fileName: archivo.name }),
      })
      setUploading(false)
    }

    onCreated(cot)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 border-t border-gray-100 pt-4">
      <div>
        <label className="label">Concepto / Sub-rubro *</label>
        <p className="text-gray-400 text-xs mb-1">Identifica qué estás cotizando dentro de esta subcategoría (ej: Comida, Bebidas, Toldas, Muebles...)</p>
        <input className="input" placeholder="Ej: Comida, Bebidas, Toldas..." value={concepto} onChange={e => setConcepto(e.target.value)} list={`conceptos-${lineaId}`} />
        {conceptosExistentes.length > 0 && (
          <datalist id={`conceptos-${lineaId}`}>
            {conceptosExistentes.map(c => <option key={c} value={c} />)}
          </datalist>
        )}
      </div>
      <div>
        <label className="label">Descripción adicional (opcional)</label>
        <input className="input" placeholder="Ej: Proveedor principal semana 1..." value={desc} onChange={e => setDesc(e.target.value)} />
      </div>

      <div>
        <label className="label">Detalle de montos *</label>
        <p className="text-gray-400 text-xs mb-2">Puedes desglosar en varias líneas si aplica</p>
        <div className="space-y-2">
          {facturas.map((f, fi) => (
            <div key={fi} className="grid grid-cols-3 gap-2 items-center">
              <input className="input" placeholder="Descripción *" value={f.descripcion}
                onChange={e => setFacturas(prev => prev.map((x,xi) => xi===fi ? {...x, descripcion: e.target.value} : x))} />
              <input className="input" placeholder="Proveedor" value={f.proveedor}
                onChange={e => setFacturas(prev => prev.map((x,xi) => xi===fi ? {...x, proveedor: e.target.value} : x))} />
              <div className="flex gap-2">
                <input type="number" step="0.01" className="input" placeholder="Monto $" value={f.monto}
                  onChange={e => setFacturas(prev => prev.map((x,xi) => xi===fi ? {...x, monto: e.target.value} : x))} />
                {facturas.length > 1 && (
                  <button type="button" onClick={() => setFacturas(prev => prev.filter((_,xi)=>xi!==fi))} className="text-red-400 hover:text-red-600">✕</button>
                )}
              </div>
            </div>
          ))}
          <button type="button" onClick={() => setFacturas(prev => [...prev, { descripcion:'', proveedor:'', monto:'' }])}
            className="text-xs text-blue-500 hover:underline">+ Agregar línea</button>
        </div>
      </div>

      {/* Adjuntar cotización PDF/imagen */}
      <div>
        <label className="label">Adjuntar cotización (PDF o imagen) *</label>
        <div
          onClick={() => fileRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-4 cursor-pointer transition-all text-center ${archivo ? 'border-green-400 bg-green-50' : 'border-gray-300 hover:border-gray-400'}`}>
          {archivo ? (
            <div className="flex items-center justify-center gap-2 text-green-700 text-sm font-medium">
              <span>📎</span><span>{archivo.name}</span>
              <button type="button" onClick={e => { e.stopPropagation(); setArchivo(null) }} className="text-red-400 hover:text-red-600 ml-2">✕</button>
            </div>
          ) : (
            <p className="text-gray-500 text-sm">📎 Haz clic para adjuntar tu cotización en PDF o imagen</p>
          )}
        </div>
        <input ref={fileRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) setArchivo(f) }} />
      </div>

      {error && <p className="text-red-500 text-sm">{error}</p>}

      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-700">
          Total: {fmt(facturas.reduce((s,f) => s + (parseFloat(f.monto)||0), 0))}
        </p>
        <button type="submit" disabled={submitting || uploading} className="btn-primary text-sm">
          {uploading ? '📤 Subiendo archivo...' : submitting ? 'Enviando...' : 'Enviar para aprobación'}
        </button>
      </div>
    </form>
  )
}

/* ── Sección de factura después de aprobación ── */
function SubirFacturaSection({ cot, onUpdated }: { cot: Cotizacion; onUpdated: (c: Cotizacion) => void }) {
  const [uploading, setUploading]   = useState(false)
  const [saving,    setSaving]      = useState(false)
  const [error,     setError]       = useState('')
  const [factura,   setFactura]     = useState({
    facturaNumero:      cot.facturaNumero      ?? '',
    facturaProveedor:   cot.facturaProveedor   ?? '',
    facturaFechaEmision: cot.facturaFechaEmision ?? '',
    facturaFechaPago:   cot.facturaFechaPago   ?? '',
    facturaSubtotal:    cot.facturaSubtotal    ?? 0,
    facturaItbms:       cot.facturaItbms       ?? 0,
    facturaTotal:       cot.facturaTotal       ?? 0,
  })
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File) {
    setUploading(true); setError('')
    try {
      const base64 = await new Promise<string>((ok, fail) => {
        const r = new FileReader(); r.onload = () => ok((r.result as string).split(',')[1]); r.onerror = fail; r.readAsDataURL(file)
      })
      const res = await fetch(`/api/cotizaciones/${cot.id}/factura`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64, mimeType: file.type, fileName: file.name }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Error al subir'); return }
      // Pre-llenar con los datos extraídos
      const ext = data.extracted ?? {}
      setFactura({
        facturaNumero:      ext.numero_factura    ?? '',
        facturaProveedor:   ext.proveedor         ?? '',
        facturaFechaEmision: ext.fecha_emision    ?? '',
        facturaFechaPago:   ext.fecha_pago        ?? '',
        facturaSubtotal:    Number(ext.subtotal)  || 0,
        facturaItbms:       Number(ext.itbms)     || 0,
        facturaTotal:       Number(ext.total)     || 0,
      })
      onUpdated(data.cotizacion)
    } catch (e) { setError(String(e)) }
    finally { setUploading(false) }
  }

  async function handleSave() {
    setSaving(true)
    const res = await fetch(`/api/cotizaciones/${cot.id}/factura`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(factura),
    })
    if (res.ok) { const updated = await res.json(); onUpdated({ ...cot, ...updated, facturaSubida: true }) }
    setSaving(false)
  }

  return (
    <div className="border-t border-green-200 pt-4 mt-4 space-y-4">
      <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3">
        <p className="text-green-700 font-semibold text-sm">✅ Cotización aprobada — ahora sube tu factura</p>
        <p className="text-green-600 text-xs mt-0.5">La IA extraerá los datos automáticamente para que los confirmes.</p>
      </div>

      {/* Upload */}
      <div>
        <label className="label">Subir factura (PDF o imagen)</label>
        <div onClick={() => fileRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-4 cursor-pointer transition-all text-center ${uploading ? 'border-amber-300 bg-amber-50' : 'border-gray-300 hover:border-gray-400'}`}>
          <p className="text-gray-500 text-sm">
            {uploading ? '⏳ Analizando factura con IA...' : '📄 Haz clic para subir tu factura'}
          </p>
        </div>
        <input ref={fileRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = '' }} />
      </div>

      {error && <p className="text-red-500 text-sm">{error}</p>}

      {/* Datos extraídos - editable */}
      {(cot.facturaSubida || factura.facturaTotal > 0) && (
        <div className="space-y-3">
          <p className="text-sm font-semibold text-gray-700">Datos de la factura — revisa y confirma:</p>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">N° Factura</label>
              <input className="input" value={factura.facturaNumero} onChange={e => setFactura(f => ({...f, facturaNumero: e.target.value}))} /></div>
            <div><label className="label">Proveedor</label>
              <input className="input" value={factura.facturaProveedor} onChange={e => setFactura(f => ({...f, facturaProveedor: e.target.value}))} /></div>
            <div><label className="label">Fecha Emisión</label>
              <input className="input" value={factura.facturaFechaEmision} onChange={e => setFactura(f => ({...f, facturaFechaEmision: e.target.value}))} /></div>
            <div><label className="label">Fecha Pago</label>
              <input className="input" value={factura.facturaFechaPago} onChange={e => setFactura(f => ({...f, facturaFechaPago: e.target.value}))} /></div>
            <div><label className="label">Subtotal $</label>
              <input type="number" step="0.01" className="input" value={factura.facturaSubtotal} onChange={e => setFactura(f => ({...f, facturaSubtotal: parseFloat(e.target.value)||0}))} /></div>
            <div><label className="label">ITBMS $</label>
              <input type="number" step="0.01" className="input" value={factura.facturaItbms} onChange={e => setFactura(f => ({...f, facturaItbms: parseFloat(e.target.value)||0}))} /></div>
            <div className="col-span-2">
              <label className="label">Total $</label>
              <input type="number" step="0.01" className="input" value={factura.facturaTotal} onChange={e => setFactura(f => ({...f, facturaTotal: parseFloat(e.target.value)||0}))} />
            </div>
          </div>
          <button onClick={handleSave} disabled={saving} className="btn-primary w-full text-sm">
            {saving ? 'Guardando...' : '💾 Confirmar y guardar factura'}
          </button>
        </div>
      )}
    </div>
  )
}

/* ── Página principal ── */
export default function CotizacionesPage() {
  const [lineas,       setLineas]       = useState<Linea[]>([])
  const [loading,      setLoading]      = useState(true)
  const [selected,     setSelected]     = useState<Linea | null>(null)
  const [showForm,     setShowForm]     = useState(false)
  const [filtroEvento, setFiltroEvento] = useState<string>('')

  useEffect(() => {
    fetch('/api/mis-asignaciones').then(r => r.json()).then(d => { setLineas(Array.isArray(d) ? d : []); setLoading(false) })
  }, [])

  function handleCreated(cot: Cotizacion) {
    setLineas(prev => prev.map(l => l.id === selected?.id ? { ...l, cotizaciones: [cot, ...l.cotizaciones] } : l))
    setSelected(prev => prev ? { ...prev, cotizaciones: [cot, ...(prev.cotizaciones ?? [])] } : prev)
    setShowForm(false)
  }

  function handleCotUpdated(lineaId: string, cotId: string, updated: Partial<Cotizacion>) {
    const merge = (cots: Cotizacion[]) => cots.map(c => c.id === cotId ? { ...c, ...updated } : c)
    setLineas(prev => prev.map(l => l.id === lineaId ? { ...l, cotizaciones: merge(l.cotizaciones) } : l))
    setSelected(prev => prev && prev.id === lineaId ? { ...prev, cotizaciones: merge(prev.cotizaciones) } : prev)
  }

  async function eliminarCot(lineaId: string, cotId: string) {
    if (!confirm('¿Eliminar esta cotización?')) return
    const res = await fetch(`/api/cotizaciones/${cotId}`, { method: 'DELETE' })
    if (res.ok) {
      setLineas(prev => prev.map(l => l.id === lineaId ? { ...l, cotizaciones: l.cotizaciones.filter(c => c.id !== cotId) } : l))
      setSelected(prev => prev && prev.id === lineaId ? { ...prev, cotizaciones: prev.cotizaciones.filter(c => c.id !== cotId) } : prev)
    }
  }

  const porEvento: Record<string, { evento: Linea['categoria']['presupuesto']['evento']; lineas: Linea[] }> = {}
  for (const l of lineas) {
    const ev = l.categoria.presupuesto.evento
    if (!porEvento[ev.id]) porEvento[ev.id] = { evento: ev, lineas: [] }
    porEvento[ev.id].lineas.push(l)
  }

  const eventosDisponibles = Object.values(porEvento).map(g => g.evento)
  const gruposVisibles = Object.values(porEvento).filter(g => !filtroEvento || g.evento.id === filtroEvento)

  function seleccionarFiltro(id: string) {
    setFiltroEvento(id)
    // Limpiar selección si la línea abierta no pertenece al evento filtrado
    if (id && selected && selected.categoria.presupuesto.evento.id !== id) {
      setSelected(null)
      setShowForm(false)
    }
  }

  if (loading) return <div className="text-gray-400 animate-pulse text-center py-16">Cargando asignaciones...</div>

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Mis Subcategorías Asignadas</h1>
        <p className="text-gray-500 mt-1">Adjunta tu cotización para aprobación. Si es aprobada, sube la factura real.</p>
      </div>

      {/* Filtro por evento */}
      {eventosDisponibles.length > 1 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Evento:</span>
          <button
            onClick={() => seleccionarFiltro('')}
            className={`text-xs px-3 py-1.5 rounded-full border-2 font-medium transition-all ${
              !filtroEvento ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 text-gray-500 hover:border-gray-400'
            }`}>
            Todos
          </button>
          {eventosDisponibles.map(ev => (
            <button key={ev.id}
              onClick={() => seleccionarFiltro(ev.id)}
              className={`text-xs px-3 py-1.5 rounded-full border-2 font-medium transition-all ${
                filtroEvento === ev.id ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 text-gray-500 hover:border-gray-400'
              }`}>
              {ev.nombre}
            </button>
          ))}
        </div>
      )}

      {lineas.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-4xl mb-3">📋</p>
          <p className="text-gray-700 font-semibold">No tienes subcategorías asignadas</p>
          <p className="text-gray-400 text-sm mt-1">El administrador te asignará categorías próximamente.</p>
        </div>
      ) : (
        <div className="grid grid-cols-5 gap-6">
          {/* Lista */}
          <div className="col-span-2 space-y-4">
            {gruposVisibles.map(({ evento, lineas: evLineas }) => (
              <div key={evento.id}>
                <div className="flex items-center gap-2 mb-2">
                  <p className="font-semibold text-gray-900 text-sm">{evento.nombre}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${evento.estado === 'ACTIVO' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{evento.estado}</span>
                </div>
                <p className="text-gray-400 text-xs mb-2">{formatDate(evento.fechaInicio)}</p>
                <div className="space-y-1.5">
                  {evLineas.map(l => {
                    const aprobado    = l.cotizaciones.filter(c => c.estado === 'APROBADA').reduce((s,c) => s + c.montoTotal, 0)
                    const pendiente   = l.cotizaciones.filter(c => c.estado === 'PENDIENTE').length
                    const sinFactura  = l.cotizaciones.filter(c => c.estado === 'APROBADA' && !c.facturaSubida).length
                    return (
                      <button key={l.id} onClick={() => { setSelected(l); setShowForm(false) }}
                        className={`card w-full text-left p-3 hover:border-gray-400 transition-all ${selected?.id === l.id ? 'border-gray-400 shadow-sm' : ''}`}>
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="text-xs text-gray-400">{l.categoria.nombre}</p>
                            <p className="font-medium text-gray-900 text-sm">{l.descripcion}</p>
                            <p className="text-gray-400 text-xs mt-0.5">Presup.: {fmt(l.montoUsd)}</p>
                          </div>
                          <div className="text-right shrink-0 ml-2 space-y-0.5">
                            <p className="text-sm font-bold text-green-600">{fmt(aprobado)}</p>
                            {pendiente > 0 && <p className="text-xs text-yellow-600">⏳ {pendiente} pendiente(s)</p>}
                            {sinFactura > 0 && <p className="text-xs text-blue-600">📄 {sinFactura} sin factura</p>}
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Detalle */}
          {selected && (
            <div className="col-span-3 space-y-4">
              <div className="card p-5">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <p className="text-xs text-gray-400">{selected.categoria.nombre}</p>
                    <h3 className="text-lg font-bold text-gray-900">{selected.descripcion}</h3>
                    {selected.nota && <p className="text-gray-500 text-sm">{selected.nota}</p>}
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-400">Presupuesto</p>
                    <p className="text-2xl font-bold text-amber-600">{fmt(selected.montoUsd)}</p>
                    <p className="text-xs text-green-600 mt-0.5">
                      Aprobado: {fmt(selected.cotizaciones.filter(c=>c.estado==='APROBADA').reduce((s,c)=>s+c.montoTotal,0))}
                    </p>
                  </div>
                </div>

                {!showForm ? (
                  <button onClick={() => setShowForm(true)} className="btn-primary w-full text-sm">
                    + Nueva Cotización
                  </button>
                ) : (
                  <NuevaCotizacionForm
                    lineaId={selected.id}
                    conceptosExistentes={Array.from(new Set(selected.cotizaciones.map(c => c.concepto).filter(Boolean) as string[]))}
                    onCreated={cot => { handleCreated(cot); setShowForm(false) }} />
                )}
              </div>

              {/* Historial agrupado por concepto */}
              {selected.cotizaciones.length > 0 && (() => {
                const grupos: Record<string, Cotizacion[]> = {}
                for (const cot of selected.cotizaciones) {
                  const key = cot.concepto || '—'
                  if (!grupos[key]) grupos[key] = []
                  grupos[key].push(cot)
                }
                return (
                  <div className="space-y-4">
                    {Object.entries(grupos).map(([grupo, cots]) => {
                      const aprobada = cots.find(c => c.estado === 'APROBADA')
                      return (
                        <div key={grupo} className="card p-5">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <h4 className="font-semibold text-gray-800 text-sm">{grupo}</h4>
                              {aprobada && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">✓ Aprobado</span>}
                            </div>
                            <span className="text-xs text-gray-400">{cots.length} cotización(es)</span>
                          </div>
                          <div className="space-y-3">
                            {cots.map(cot => (
                              <div key={cot.id} className={`rounded-xl p-4 ${cot.estado === 'APROBADA' ? 'bg-green-50 border border-green-200' : cot.estado === 'RECHAZADA' ? 'bg-red-50 border border-red-100' : 'bg-gray-50'}`}>
                                <div className="flex items-start justify-between mb-2">
                                  <div>
                                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ESTADO_COLORS[cot.estado]}`}>{cot.estado}</span>
                                    <p className="text-xs text-gray-400 mt-1">{new Date(cot.createdAt).toLocaleDateString('es-PA')}</p>
                                    {cot.descripcion && <p className="text-sm text-gray-600 mt-1">{cot.descripcion}</p>}
                                  </div>
                                  <div className="text-right">
                                    <p className="font-bold text-gray-900">{fmt(cot.montoTotal)}</p>
                                    {cot.estado === 'PENDIENTE' && (
                                      <button onClick={() => eliminarCot(selected.id, cot.id)} className="text-xs text-red-400 hover:text-red-600 mt-1 block">Eliminar</button>
                                    )}
                                  </div>
                                </div>
                                <div className="flex flex-wrap gap-2 mb-2">
                                  {cot.facturas.map(f => (
                                    <span key={f.id} className="text-xs bg-white border border-gray-200 rounded-lg px-2 py-1 text-gray-600">
                                      {f.descripcion}{f.proveedor ? ` · ${f.proveedor}` : ''} — {fmt(f.monto)}
                                    </span>
                                  ))}
                                </div>
                                {cot.archivoUrl && (
                                  <a href={cot.archivoUrl} target="_blank" rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-xs text-blue-500 hover:underline mb-2">
                                    📎 {cot.archivoNombreCot ?? 'Ver cotización adjunta'}
                                  </a>
                                )}
                                {cot.notaAdmin && (
                                  <div className="pt-2 border-t border-gray-200">
                                    <p className="text-xs text-gray-500 italic">Admin: "{cot.notaAdmin}"</p>
                                  </div>
                                )}
                                {cot.estado === 'APROBADA' && cot.facturaSubida && (
                                  <div className="mt-3 pt-3 border-t border-green-200 bg-white bg-opacity-60 rounded-xl px-3 py-2">
                                    <p className="text-xs font-semibold text-green-700 mb-1">📋 Factura registrada</p>
                                    <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-green-600">
                                      {cot.facturaNumero    && <span>N°: {cot.facturaNumero}</span>}
                                      {cot.facturaProveedor && <span>Proveedor: {cot.facturaProveedor}</span>}
                                      {cot.facturaFechaEmision && <span>Emisión: {cot.facturaFechaEmision}</span>}
                                      {cot.facturaTotal != null && <span className="font-bold">Total: {fmt(cot.facturaTotal)}</span>}
                                    </div>
                                    {cot.facturaUrl && (
                                      <a href={cot.facturaUrl} target="_blank" rel="noopener noreferrer"
                                        className="text-xs text-blue-500 hover:underline mt-1 inline-block">📄 Ver factura</a>
                                    )}
                                  </div>
                                )}
                                {cot.estado === 'APROBADA' && !cot.facturaSubida && (
                                  <SubirFacturaSection cot={cot}
                                    onUpdated={updated => handleCotUpdated(selected.id, cot.id, updated)} />
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              })()}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

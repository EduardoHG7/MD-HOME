'use client'

import { useEffect, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import { formatCurrency } from '@/lib/utils'

interface Evento  { id: string; nombre: string }
interface Extracted {
  _localId:      string
  archivoNombre: string | null
  numeroFactura: string | null
  proveedor:     string | null
  rucDv:         string | null
  descripcion:   string | null
  fechaEmision:  string | null
  fechaPago:     string | null
  subtotal:      number
  itbms:         number
  total:         number
}
interface Factura extends Extracted {
  id:          string
  responsable: string
  createdAt:   string
  evento:      Evento | null
}
interface QueueItem {
  id:      string
  name:    string
  status:  'pending' | 'processing' | 'done' | 'error'
  result?: Extracted
  error?:  string
}

export default function FacturasPage() {
  const { data: session } = useSession()
  const [eventos,     setEventos]     = useState<Evento[]>([])
  const [facturas,    setFacturas]    = useState<Factura[]>([])
  const [queue,       setQueue]       = useState<QueueItem[]>([])
  const [extracted,   setExtracted]   = useState<Extracted[]>([])
  const [eventoId,    setEventoId]    = useState('')
  const [responsable, setResponsable] = useState('')
  const [saving,      setSaving]      = useState(false)
  const [exporting,   setExporting]   = useState(false)
  const [tab,         setTab]         = useState<'subir' | 'guardadas'>('guardadas')
  const [dragging,    setDragging]    = useState(false)

  // Filtros para la vista guardadas
  const [filtroEvento,      setFiltroEvento]      = useState('')
  const [filtroResponsable, setFiltroResponsable] = useState('')

  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (session?.user?.name) setResponsable(session.user.name)
    else if (session?.user?.email) setResponsable(session.user.email)
  }, [session])

  useEffect(() => {
    fetch('/api/eventos').then(r => r.json()).then(d => setEventos(Array.isArray(d) ? d : []))
    loadFacturas()
  }, [])

  function loadFacturas() {
    fetch('/api/facturas').then(r => r.json()).then(d => {
      if (Array.isArray(d)) setFacturas(d)
    })
  }

  function addFiles(files: FileList | File[]) {
    const allowed = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp']
    const items = Array.from(files)
      .filter(f => allowed.includes(f.type))
      .map(f => ({ id: crypto.randomUUID(), name: f.name, status: 'pending' as const, _file: f }))
    if (!items.length) return
    setQueue(prev => [...prev, ...items])
    processQueue(items)
  }

  async function processQueue(items: (QueueItem & { _file: File })[]) {
    for (const item of items) {
      setQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: 'processing' } : q))
      try {
        const base64 = await fileToBase64(item._file)
        const res = await fetch('/api/facturas/extract', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ base64, mimeType: item._file.type, fileName: item._file.name }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Error procesando')
        const result: Extracted = { ...data, _localId: item.id }
        setQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: 'done', result } : q))
        setExtracted(prev => [...prev, result])
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Error'
        setQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: 'error', error: msg } : q))
      }
    }
  }

  function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload  = () => resolve((reader.result as string).split(',')[1])
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  async function handleSave() {
    if (!extracted.length || !responsable.trim()) { alert('Completa el campo Responsable'); return }
    setSaving(true)
    const res = await fetch('/api/facturas', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventoId: eventoId || null, responsable, items: extracted }),
    })
    if (res.ok) { setExtracted([]); setQueue([]); loadFacturas(); setTab('guardadas') }
    setSaving(false)
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar esta factura?')) return
    await fetch(`/api/facturas/${id}`, { method: 'DELETE' })
    setFacturas(prev => prev.filter(f => f.id !== id))
  }

  async function handleExport(lista: Factura[] | Extracted[]) {
    if (!lista.length) return
    setExporting(true)
    const eventoNombre = eventos.find(e => e.id === eventoId)?.nombre ?? filtroEvento ?? ''
    const res = await fetch('/api/facturas/export', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ facturas: lista, eventoNombre }),
    })
    if (res.ok) {
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = res.headers.get('Content-Disposition')?.split('filename="')[1]?.replace('"', '') ?? 'facturas.xlsx'
      a.click()
      URL.revokeObjectURL(url)
    }
    setExporting(false)
  }

  // Filtrar facturas guardadas
  const facturasFiltradas = facturas.filter(f => {
    const matchEvento      = !filtroEvento      || f.evento?.id === filtroEvento
    const matchResponsable = !filtroResponsable || f.responsable === filtroResponsable
    return matchEvento && matchResponsable
  })

  // Responsables únicos para el filtro
  const responsablesUnicos = Array.from(new Set(facturas.map(f => f.responsable))).sort()

  // Totales de facturas filtradas
  const totalFiltrado  = facturasFiltradas.reduce((s, f) => s + f.total, 0)
  const totalSubtotal  = facturasFiltradas.reduce((s, f) => s + f.subtotal, 0)
  const totalItbms     = facturasFiltradas.reduce((s, f) => s + f.itbms, 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Registro de Facturas</h1>
          <p className="text-gray-500 mt-1">Extracción con IA y gestión de facturas de todos los usuarios</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200">
        {[
          { id: 'guardadas', label: `🗂️ Todas las Facturas (${facturas.length})` },
          { id: 'subir',     label: `📤 Subir Facturas${extracted.length ? ` (${extracted.length})` : ''}` },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id as 'subir' | 'guardadas')}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-all -mb-px ${
              tab === t.id ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* TAB: TODAS LAS FACTURAS */}
      {tab === 'guardadas' && (
        <div className="space-y-5">

          {/* Filtros */}
          <div className="card p-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="label">Filtrar por Evento</label>
                <select className="input" value={filtroEvento} onChange={e => setFiltroEvento(e.target.value)}>
                  <option value="">Todos los eventos</option>
                  {eventos.map(ev => <option key={ev.id} value={ev.id}>{ev.nombre}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Filtrar por Responsable</label>
                <select className="input" value={filtroResponsable} onChange={e => setFiltroResponsable(e.target.value)}>
                  <option value="">Todos los usuarios</option>
                  {responsablesUnicos.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div className="flex items-end">
                <button
                  onClick={() => handleExport(facturasFiltradas)}
                  disabled={exporting || !facturasFiltradas.length}
                  className="btn-primary w-full"
                >
                  {exporting ? '⏳ Exportando...' : '📊 Exportar Excel'}
                </button>
              </div>
            </div>
          </div>

          {/* Resumen de totales */}
          {facturasFiltradas.length > 0 && (
            <div className="grid grid-cols-4 gap-4">
              <div className="card p-4 text-center">
                <p className="text-2xl font-bold text-gray-900">{facturasFiltradas.length}</p>
                <p className="text-gray-500 text-sm mt-1">Facturas</p>
              </div>
              <div className="card p-4 text-center">
                <p className="text-2xl font-bold text-gray-900">{formatCurrency(totalSubtotal)}</p>
                <p className="text-gray-500 text-sm mt-1">Subtotal</p>
              </div>
              <div className="card p-4 text-center">
                <p className="text-2xl font-bold text-gray-900">{formatCurrency(totalItbms)}</p>
                <p className="text-gray-500 text-sm mt-1">ITBMS</p>
              </div>
              <div className="card p-4 text-center">
                <p className="text-2xl font-bold text-green-600">{formatCurrency(totalFiltrado)}</p>
                <p className="text-gray-500 text-sm mt-1">Total General</p>
              </div>
            </div>
          )}

          {/* Tabla completa */}
          {facturasFiltradas.length === 0 ? (
            <div className="card p-10 text-center">
              <p className="text-4xl mb-3">🗂️</p>
              <p className="text-gray-700 font-semibold">No hay facturas{filtroEvento || filtroResponsable ? ' con estos filtros' : ' aún'}</p>
              {(filtroEvento || filtroResponsable) && (
                <button onClick={() => { setFiltroEvento(''); setFiltroResponsable('') }}
                  className="text-sm text-gray-500 underline mt-2">Limpiar filtros</button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-gray-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                    <th className="px-4 py-3 text-left">Evento</th>
                    <th className="px-4 py-3 text-left">Usuario</th>
                    <th className="px-4 py-3 text-left">N° Factura</th>
                    <th className="px-4 py-3 text-left">Proveedor</th>
                    <th className="px-4 py-3 text-left">RUC/DV</th>
                    <th className="px-4 py-3 text-left">Descripción</th>
                    <th className="px-4 py-3 text-left">F. Emisión</th>
                    <th className="px-4 py-3 text-left">F. Pago</th>
                    <th className="px-4 py-3 text-left">Archivo</th>
                    <th className="px-4 py-3 text-right">Subtotal</th>
                    <th className="px-4 py-3 text-right">ITBMS</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-700">Total</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {facturasFiltradas.map(f => (
                    <tr key={f.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        {f.evento
                          ? <span className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded-lg text-xs font-medium">{f.evento.nombre}</span>
                          : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-gray-900 flex items-center justify-center text-white text-xs font-bold shrink-0">
                            {f.responsable?.[0]?.toUpperCase() ?? '?'}
                          </div>
                          <span className="text-gray-700 font-medium truncate max-w-[100px]">{f.responsable}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-medium">{f.numeroFactura ?? '—'}</td>
                      <td className="px-4 py-3 max-w-[140px] truncate">{f.proveedor ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{f.rucDv ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-600 max-w-[160px] truncate">{f.descripcion ?? '—'}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{f.fechaEmision ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{f.fechaPago ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-400 text-xs max-w-[100px] truncate" title={f.archivoNombre ?? ''}>
                        {f.archivoNombre ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">{formatCurrency(f.subtotal)}</td>
                      <td className="px-4 py-3 text-right text-gray-500 whitespace-nowrap">{formatCurrency(f.itbms)}</td>
                      <td className="px-4 py-3 text-right font-bold text-gray-900 whitespace-nowrap">{formatCurrency(f.total)}</td>
                      <td className="px-4 py-3">
                        <button onClick={() => handleDelete(f.id)}
                          className="text-red-400 hover:text-red-600 transition-colors">✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                {/* Fila de totales */}
                <tfoot>
                  <tr className="bg-gray-50 font-semibold text-gray-700 border-t-2 border-gray-200">
                    <td colSpan={9} className="px-4 py-3 text-right text-xs uppercase tracking-wide text-gray-500">
                      Totales ({facturasFiltradas.length} factura{facturasFiltradas.length !== 1 ? 's' : ''})
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">{formatCurrency(totalSubtotal)}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">{formatCurrency(totalItbms)}</td>
                    <td className="px-4 py-3 text-right text-green-600 whitespace-nowrap">{formatCurrency(totalFiltrado)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB: SUBIR */}
      {tab === 'subir' && (
        <div className="space-y-5">
          <div className="card p-5">
            <h3 className="font-semibold text-gray-900 mb-4">Contexto de las facturas</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Responsable *</label>
                <input className="input" placeholder="Nombre del responsable"
                  value={responsable} onChange={e => setResponsable(e.target.value)} />
              </div>
              <div>
                <label className="label">Evento (opcional)</label>
                <select className="input" value={eventoId} onChange={e => setEventoId(e.target.value)}>
                  <option value="">Sin evento específico</option>
                  {eventos.map(ev => <option key={ev.id} value={ev.id}>{ev.nombre}</option>)}
                </select>
              </div>
            </div>
          </div>

          <div
            className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all ${
              dragging ? 'border-gray-900 bg-gray-50' : 'border-gray-300 hover:border-gray-400'
            }`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files) }}
          >
            <p className="text-4xl mb-3">📄</p>
            <p className="text-gray-700 font-semibold">Arrastra tus facturas aquí</p>
            <p className="text-gray-400 text-sm mt-1">PDF, PNG, JPG, WEBP — múltiples archivos</p>
            <input ref={fileInputRef} type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.webp"
              className="hidden" onChange={e => e.target.files && addFiles(e.target.files)} />
          </div>

          {queue.length > 0 && (
            <div className="card divide-y divide-gray-100">
              {queue.map(item => (
                <div key={item.id} className="flex items-center gap-3 px-5 py-3">
                  <span className="text-lg shrink-0">
                    {item.status === 'pending'    && '⏳'}
                    {item.status === 'processing' && '🔄'}
                    {item.status === 'done'       && '✅'}
                    {item.status === 'error'      && '❌'}
                  </span>
                  <span className="flex-1 text-sm text-gray-700 truncate">{item.name}</span>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    item.status === 'processing' ? 'bg-blue-50 text-blue-600' :
                    item.status === 'done'       ? 'bg-green-50 text-green-600' :
                    item.status === 'error'      ? 'bg-red-50 text-red-600' :
                                                   'bg-gray-100 text-gray-500'
                  }`}>
                    {item.status === 'processing' ? 'Procesando...' :
                     item.status === 'done'       ? 'Listo' :
                     item.status === 'error'      ? (item.error ?? 'Error') : 'En espera'}
                  </span>
                </div>
              ))}
            </div>
          )}

          {extracted.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-gray-900">{extracted.length} factura{extracted.length !== 1 ? 's' : ''} extraída{extracted.length !== 1 ? 's' : ''}</h3>
                <div className="flex items-center gap-4">
                  <span className="text-gray-500 text-sm">
                    Total: <span className="font-bold text-gray-900">{formatCurrency(extracted.reduce((s, f) => s + f.total, 0))}</span>
                  </span>
                  <button onClick={handleSave} disabled={saving || !responsable.trim()} className="btn-primary">
                    {saving ? 'Guardando...' : `💾 Guardar ${extracted.length} factura${extracted.length !== 1 ? 's' : ''}`}
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto rounded-2xl border border-gray-200">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                      <th className="px-4 py-3 text-left">Archivo</th>
                      <th className="px-4 py-3 text-left">N° Factura</th>
                      <th className="px-4 py-3 text-left">Proveedor</th>
                      <th className="px-4 py-3 text-left">Descripción</th>
                      <th className="px-4 py-3 text-left">F. Emisión</th>
                      <th className="px-4 py-3 text-right">Subtotal</th>
                      <th className="px-4 py-3 text-right">ITBMS</th>
                      <th className="px-4 py-3 text-right">Total</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {extracted.map(f => (
                      <tr key={f._localId} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-500 truncate max-w-[120px]">{f.archivoNombre ?? '—'}</td>
                        <td className="px-4 py-3 font-medium">{f.numeroFactura ?? '—'}</td>
                        <td className="px-4 py-3">{f.proveedor ?? '—'}</td>
                        <td className="px-4 py-3 text-gray-600 max-w-[160px] truncate">{f.descripcion ?? '—'}</td>
                        <td className="px-4 py-3">{f.fechaEmision ?? '—'}</td>
                        <td className="px-4 py-3 text-right">{formatCurrency(f.subtotal)}</td>
                        <td className="px-4 py-3 text-right text-gray-500">{formatCurrency(f.itbms)}</td>
                        <td className="px-4 py-3 text-right font-bold text-gray-900">{formatCurrency(f.total)}</td>
                        <td className="px-4 py-3">
                          <button onClick={() => {
                            setExtracted(prev => prev.filter(e => e._localId !== f._localId))
                            setQueue(prev => prev.filter(q => q.id !== f._localId))
                          }} className="text-red-400 hover:text-red-600">✕</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

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
  id:       string
  name:     string
  status:   'pending' | 'processing' | 'done' | 'error'
  result?:  Extracted
  error?:   string
}

export default function FacturasPage() {
  const { data: session } = useSession()
  const [eventos,      setEventos]      = useState<Evento[]>([])
  const [facturas,     setFacturas]     = useState<Factura[]>([])
  const [queue,        setQueue]        = useState<QueueItem[]>([])
  const [extracted,    setExtracted]    = useState<Extracted[]>([])
  const [eventoId,     setEventoId]     = useState('')
  const [responsable,  setResponsable]  = useState('')

  useEffect(() => {
    if (session?.user?.name) setResponsable(session.user.name)
    else if (session?.user?.email) setResponsable(session.user.email)
  }, [session])
  const [saving,       setSaving]       = useState(false)
  const [exporting,    setExporting]    = useState(false)
  const [tab,          setTab]          = useState<'subir' | 'guardadas'>('subir')
  const [dragging,     setDragging]     = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch('/api/eventos').then(r => r.json()).then(setEventos)
    loadFacturas()
  }, [])

  function loadFacturas() {
    fetch('/api/facturas').then(r => r.json()).then(data => {
      if (Array.isArray(data)) setFacturas(data)
    })
  }

  function addFiles(files: FileList | File[]) {
    const allowed = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp']
    const items: QueueItem[] = Array.from(files)
      .filter(f => allowed.includes(f.type))
      .map(f => ({ id: crypto.randomUUID(), name: f.name, status: 'pending', _file: f } as QueueItem & { _file: File }))
    if (!items.length) return
    setQueue(prev => [...prev, ...items])
    processQueue(items as (QueueItem & { _file: File })[])
  }

  async function processQueue(items: (QueueItem & { _file: File })[]) {
    for (const item of items) {
      setQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: 'processing' } : q))
      try {
        const base64 = await fileToBase64(item._file)
        const res = await fetch('/api/facturas/extract', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ base64, mimeType: item._file.type, fileName: item._file.name }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Error procesando')
        const result: Extracted = { ...data, _localId: item.id }
        setQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: 'done', result } : q))
        setExtracted(prev => [...prev, result])
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Error desconocido'
        setQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: 'error', error: msg } : q))
      }
    }
  }

  function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const result = reader.result as string
        resolve(result.split(',')[1])
      }
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  function removeExtracted(localId: string) {
    setExtracted(prev => prev.filter(e => e._localId !== localId))
    setQueue(prev => prev.filter(q => q.id !== localId))
  }

  async function handleSave() {
    if (!extracted.length) return
    if (!responsable.trim()) { alert('Indica el responsable'); return }
    setSaving(true)
    const res = await fetch('/api/facturas', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventoId: eventoId || null, responsable, items: extracted }),
    })
    if (res.ok) {
      setExtracted([])
      setQueue([])
      loadFacturas()
      setTab('guardadas')
    }
    setSaving(false)
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar esta factura?')) return
    await fetch(`/api/facturas/${id}`, { method: 'DELETE' })
    setFacturas(prev => prev.filter(f => f.id !== id))
  }

  async function handleExport() {
    const list = tab === 'guardadas' ? facturas : extracted
    if (!list.length) return
    setExporting(true)
    const eventoNombre = eventos.find(e => e.id === eventoId)?.nombre ?? ''
    const res = await fetch('/api/facturas/export', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ facturas: list, eventoNombre }),
    })
    if (res.ok) {
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = res.headers.get('Content-Disposition')?.split('filename="')[1]?.replace('"','') ?? 'facturas.xlsx'
      a.click()
      URL.revokeObjectURL(url)
    }
    setExporting(false)
  }

  const totalExtracted = extracted.reduce((s, f) => s + f.total, 0)
  const totalGuardadas = facturas.reduce((s, f) => s + f.total, 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Registro de Facturas</h1>
          <p className="text-gray-500 mt-1">Extracción y registro de facturas con IA</p>
        </div>
        <button
          onClick={handleExport}
          disabled={exporting}
          className="btn-primary flex items-center gap-2"
        >
          {exporting ? '⏳ Exportando...' : '📊 Exportar Excel'}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200">
        {[
          { id: 'subir',     label: `📤 Subir Facturas${extracted.length ? ` (${extracted.length})` : ''}` },
          { id: 'guardadas', label: `🗂️ Guardadas (${facturas.length})` },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id as 'subir' | 'guardadas')}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-all -mb-px ${
              tab === t.id ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* TAB: Subir */}
      {tab === 'subir' && (
        <div className="space-y-5">
          {/* Contexto */}
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

          {/* Dropzone */}
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

          {/* Cola de archivos */}
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
                     item.status === 'error'      ? item.error ?? 'Error' : 'En espera'}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Resultados extraídos */}
          {extracted.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-gray-900">
                  Resultados extraídos ({extracted.length} factura{extracted.length !== 1 ? 's' : ''})
                </h3>
                <div className="flex items-center gap-4">
                  <span className="text-gray-500 text-sm">
                    Total: <span className="font-bold text-gray-900">{formatCurrency(totalExtracted)}</span>
                  </span>
                  <button onClick={handleSave} disabled={saving || !responsable.trim()}
                    className="btn-primary">
                    {saving ? 'Guardando...' : `💾 Guardar ${extracted.length} factura${extracted.length !== 1 ? 's' : ''}`}
                  </button>
                </div>
              </div>
              <FacturasTable items={extracted} onDelete={removeExtracted} showDelete />
            </div>
          )}
        </div>
      )}

      {/* TAB: Guardadas */}
      {tab === 'guardadas' && (
        <div className="space-y-4">
          {facturas.length === 0 ? (
            <div className="card p-10 text-center">
              <p className="text-4xl mb-3">🗂️</p>
              <p className="text-gray-700 font-semibold">No hay facturas guardadas aún</p>
              <p className="text-gray-400 text-sm mt-1">Sube y procesa facturas en la pestaña "Subir Facturas"</p>
            </div>
          ) : (
            <>
              <div className="flex justify-end">
                <span className="text-gray-500 text-sm">
                  Total general: <span className="font-bold text-gray-900 text-base">{formatCurrency(totalGuardadas)}</span>
                </span>
              </div>
              <SavedFacturasTable items={facturas} onDelete={handleDelete} />
            </>
          )}
        </div>
      )}
    </div>
  )
}

/* ---- Tabla de extraídas ---- */
function FacturasTable({ items, onDelete, showDelete }: {
  items: Extracted[]
  onDelete: (id: string) => void
  showDelete?: boolean
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-gray-200">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
            <th className="px-4 py-3 text-left">Archivo</th>
            <th className="px-4 py-3 text-left">N° Factura</th>
            <th className="px-4 py-3 text-left">Proveedor</th>
            <th className="px-4 py-3 text-left">RUC/DV</th>
            <th className="px-4 py-3 text-left">Descripción</th>
            <th className="px-4 py-3 text-left">F. Emisión</th>
            <th className="px-4 py-3 text-left">F. Pago</th>
            <th className="px-4 py-3 text-right">Subtotal</th>
            <th className="px-4 py-3 text-right">ITBMS</th>
            <th className="px-4 py-3 text-right font-semibold text-gray-700">Total</th>
            {showDelete && <th className="px-4 py-3" />}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {items.map(f => (
            <tr key={f._localId} className="hover:bg-gray-50 transition-colors">
              <td className="px-4 py-3 text-gray-500 truncate max-w-[120px]">{f.archivoNombre ?? '—'}</td>
              <td className="px-4 py-3 font-medium">{f.numeroFactura ?? '—'}</td>
              <td className="px-4 py-3">{f.proveedor ?? '—'}</td>
              <td className="px-4 py-3 text-gray-500">{f.rucDv ?? '—'}</td>
              <td className="px-4 py-3 text-gray-600 max-w-[180px] truncate">{f.descripcion ?? '—'}</td>
              <td className="px-4 py-3">{f.fechaEmision ?? '—'}</td>
              <td className="px-4 py-3 text-gray-500">{f.fechaPago ?? '—'}</td>
              <td className="px-4 py-3 text-right">{formatCurrency(f.subtotal)}</td>
              <td className="px-4 py-3 text-right text-gray-500">{formatCurrency(f.itbms)}</td>
              <td className="px-4 py-3 text-right font-bold text-gray-900">{formatCurrency(f.total)}</td>
              {showDelete && (
                <td className="px-4 py-3">
                  <button onClick={() => onDelete(f._localId)}
                    className="text-red-400 hover:text-red-600 transition-colors">✕</button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* ---- Tabla de guardadas ---- */
function SavedFacturasTable({ items, onDelete }: { items: Factura[]; onDelete: (id: string) => void }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-gray-200">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
            <th className="px-4 py-3 text-left">Evento</th>
            <th className="px-4 py-3 text-left">Responsable</th>
            <th className="px-4 py-3 text-left">N° Factura</th>
            <th className="px-4 py-3 text-left">Proveedor</th>
            <th className="px-4 py-3 text-left">Descripción</th>
            <th className="px-4 py-3 text-left">F. Emisión</th>
            <th className="px-4 py-3 text-left">F. Pago</th>
            <th className="px-4 py-3 text-right">Subtotal</th>
            <th className="px-4 py-3 text-right">ITBMS</th>
            <th className="px-4 py-3 text-right font-semibold text-gray-700">Total</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {items.map(f => (
            <tr key={f.id} className="hover:bg-gray-50 transition-colors">
              <td className="px-4 py-3 text-gray-500">{f.evento?.nombre ?? '—'}</td>
              <td className="px-4 py-3">{f.responsable}</td>
              <td className="px-4 py-3 font-medium">{f.numeroFactura ?? '—'}</td>
              <td className="px-4 py-3">{f.proveedor ?? '—'}</td>
              <td className="px-4 py-3 text-gray-600 max-w-[160px] truncate">{f.descripcion ?? '—'}</td>
              <td className="px-4 py-3">{f.fechaEmision ?? '—'}</td>
              <td className="px-4 py-3 text-gray-500">{f.fechaPago ?? '—'}</td>
              <td className="px-4 py-3 text-right">{formatCurrency(f.subtotal)}</td>
              <td className="px-4 py-3 text-right text-gray-500">{formatCurrency(f.itbms)}</td>
              <td className="px-4 py-3 text-right font-bold text-gray-900">{formatCurrency(f.total)}</td>
              <td className="px-4 py-3">
                <button onClick={() => onDelete(f.id)}
                  className="text-red-400 hover:text-red-600 transition-colors">✕</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

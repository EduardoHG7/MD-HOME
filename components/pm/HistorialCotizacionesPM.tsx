'use client'

import { useEffect, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'

interface Item {
  id: string; descripcion: string; ancho: number | null; alto: number | null
  cantidad: number; costoUnitario: number; precioUnitario: number; incluido: boolean
  incluyeInstalacion: boolean; incluyeDiseno: boolean
}
interface FacturaCR { id: string; descripcion: string | null; proveedor: string | null; monto: number; archivoNombre: string | null; archivoPath: string | null }
interface CotizacionPM {
  id: string; nombreTrabajo: string; clienteNombre: string; clienteContacto: string | null
  nivelPrecio: string; vigenciaDias: number; carpetaDriveUrl: string | null; notas: string | null
  transporte: number; costosIndirectosPct: number; fechaEntrega: string | null
  estado: string; notaAdmin: string | null
  montoVenta: number; costoTotal: number; utilidadBruta: number
  costoRealTotal: number | null; costoRealEstado: string | null; costoRealNotaAdmin: string | null
  createdAt: string
  evento: { id: string; nombre: string } | null
  creadoPor: { name: string | null; email: string }
  aprobadaPor: { name: string | null; email: string } | null
  items: Item[]
  facturasCostoReal: FacturaCR[]
}

const ESTADO_COLORS: Record<string, string> = {
  PENDIENTE: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  APROBADA:  'bg-green-100 text-green-700 border-green-200',
  RECHAZADA: 'bg-red-100 text-red-600 border-red-200',
  APROBADO:  'bg-green-100 text-green-700 border-green-200',
  RECHAZADO: 'bg-red-100 text-red-600 border-red-200',
}
const ESTADO_LABELS: Record<string, string> = {
  PENDIENTE: 'Pendiente', APROBADA: 'Aprobada', RECHAZADA: 'Rechazada',
  APROBADO: 'Aprobado', RECHAZADO: 'Rechazado',
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload  = () => resolve((reader.result as string).split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function CostoRealForm({ cot, onDone }: { cot: CotizacionPM; onDone: (c: CotizacionPM) => void }) {
  const [monto, setMonto] = useState('')
  const [facturas, setFacturas] = useState<{ descripcion: string; proveedor: string; monto: string; file: File | null }[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  function agregarFactura() { setFacturas(prev => [...prev, { descripcion: '', proveedor: '', monto: '', file: null }]) }
  function actualizar(i: number, campo: string, valor: string) {
    setFacturas(prev => prev.map((f, idx) => idx === i ? { ...f, [campo]: valor } : f))
  }
  function asignarArchivo(i: number, file: File) {
    setFacturas(prev => prev.map((f, idx) => idx === i ? { ...f, file } : f))
  }

  async function enviar() {
    if (!monto || parseFloat(monto) <= 0) { setError('Ingresa el monto real total.'); return }
    setLoading(true); setError('')
    try {
      const facturasPayload = await Promise.all(facturas.map(async f => ({
        descripcion: f.descripcion, proveedor: f.proveedor, monto: parseFloat(f.monto) || 0,
        archivo: f.file ? { base64: await fileToBase64(f.file), mimeType: f.file.type, fileName: f.file.name } : null,
      })))
      const res = await fetch(`/api/pm/cotizaciones/${cot.id}/costo-real`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ costoRealTotal: parseFloat(monto), facturas: facturasPayload }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) { setError(data?.error ?? 'Error al enviar'); return }
      onDone(data)
    } finally { setLoading(false) }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3 mt-2">
      <p className="text-sm font-semibold text-gray-900">🧾 Subir costo real</p>
      <div>
        <label className="label">Monto real total ($) *</label>
        <input className="input" type="number" step="0.01" min="0" value={monto} onChange={e => setMonto(e.target.value)} />
      </div>
      <div className="space-y-2">
        {facturas.map((f, i) => (
          <div key={i} className="grid grid-cols-4 gap-2 items-center bg-gray-50 rounded-lg p-2">
            <input className="input text-xs" placeholder="Descripción" value={f.descripcion} onChange={e => actualizar(i, 'descripcion', e.target.value)} />
            <input className="input text-xs" placeholder="Proveedor" value={f.proveedor} onChange={e => actualizar(i, 'proveedor', e.target.value)} />
            <input className="input text-xs" type="number" placeholder="Monto" value={f.monto} onChange={e => actualizar(i, 'monto', e.target.value)} />
            <label className="text-xs text-blue-500 cursor-pointer truncate">
              {f.file ? `📎 ${f.file.name}` : '📎 Adjuntar'}
              <input ref={fileRef} type="file" accept=".pdf,image/*" className="hidden"
                onChange={e => { const file = e.target.files?.[0]; if (file) asignarArchivo(i, file) }} />
            </label>
          </div>
        ))}
        <button type="button" onClick={agregarFactura} className="btn-ghost text-xs">+ Agregar factura de respaldo</button>
      </div>
      {error && <p className="text-red-500 text-xs">{error}</p>}
      <button type="button" onClick={enviar} disabled={loading} className="btn-primary text-sm">
        {loading ? 'Enviando...' : 'Enviar costo real para aprobación'}
      </button>
    </div>
  )
}

function AprobarPanel({ onAprobar, onRechazar, etiqueta }: { onAprobar: (nota: string) => void; onRechazar: (nota: string) => void; etiqueta: string }) {
  const [nota, setNota] = useState('')
  const [loading, setLoading] = useState<'aprobar' | 'rechazar' | null>(null)
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2 mt-2">
      <p className="text-xs font-semibold text-amber-700">{etiqueta}</p>
      <input className="input text-xs" placeholder="Nota (opcional)" value={nota} onChange={e => setNota(e.target.value)} />
      <div className="flex gap-2">
        <button type="button" disabled={!!loading}
          onClick={async () => { setLoading('aprobar'); await onAprobar(nota); setLoading(null) }}
          className="btn-primary text-xs py-1.5 flex-1 bg-green-600 hover:bg-green-700">
          {loading === 'aprobar' ? '...' : '✓ Aprobar'}
        </button>
        <button type="button" disabled={!!loading}
          onClick={async () => { setLoading('rechazar'); await onRechazar(nota); setLoading(null) }}
          className="btn-ghost text-xs py-1.5 flex-1 border-red-200 text-red-500">
          {loading === 'rechazar' ? '...' : '✕ Rechazar'}
        </button>
      </div>
    </div>
  )
}

export function HistorialCotizacionesPM({ esAdmin }: { esAdmin: boolean }) {
  const { data: session } = useSession()
  const [cotizaciones, setCotizaciones] = useState<CotizacionPM[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)

  function cargar() {
    fetch('/api/pm/cotizaciones').then(r => r.json()).then(d => setCotizaciones(Array.isArray(d) ? d : [])).finally(() => setCargando(false))
  }
  useEffect(cargar, [])

  function actualizarCot(actualizada: CotizacionPM) {
    setCotizaciones(prev => prev.map(c => c.id === actualizada.id ? actualizada : c))
  }

  async function aprobar(id: string, estado: 'APROBADA' | 'RECHAZADA', notaAdmin: string) {
    const res = await fetch(`/api/pm/cotizaciones/${id}/aprobar`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado, notaAdmin }),
    })
    if (res.ok) actualizarCot(await res.json())
  }

  async function aprobarCostoReal(id: string, estado: 'APROBADO' | 'RECHAZADO', notaAdmin: string) {
    const res = await fetch(`/api/pm/cotizaciones/${id}/costo-real/aprobar`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado, notaAdmin }),
    })
    if (res.ok) actualizarCot(await res.json())
  }

  if (cargando) return <p className="text-gray-400 text-sm text-center py-8">Cargando...</p>
  if (cotizaciones.length === 0) {
    return (
      <div className="card p-10 text-center">
        <p className="text-4xl mb-3">🖨️</p>
        <p className="text-gray-700 font-semibold">No hay cotizaciones aún</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {cotizaciones.map(cot => {
        const isExpanded = expandedId === cot.id
        const esCreador = session?.user?.email === cot.creadoPor.email
        const puedeSubirCostoReal = (esAdmin || esCreador) && cot.estado === 'APROBADA' &&
          (!cot.costoRealEstado || cot.costoRealEstado === 'RECHAZADO')
        return (
          <div key={cot.id} className="card overflow-hidden">
            <button className="w-full text-left p-4 hover:bg-gray-50 transition-colors" onClick={() => setExpandedId(isExpanded ? null : cot.id)}>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900 truncate">{cot.nombreTrabajo}</p>
                  <p className="text-gray-500 text-sm mt-0.5">
                    {cot.clienteNombre}{cot.evento ? ` · 🎪 ${cot.evento.nombre}` : ''}
                  </p>
                  <p className="text-gray-400 text-xs mt-0.5">
                    {cot.creadoPor.name ?? cot.creadoPor.email} · {new Date(cot.createdAt).toLocaleDateString('es-PA')}
                    {cot.fechaEntrega ? ` · Entrega: ${new Date(cot.fechaEntrega).toLocaleDateString('es-PA')}` : ''}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-bold text-gray-900">${cot.montoVenta.toFixed(2)}</p>
                  <div className="flex gap-1 justify-end mt-1">
                    <span className={`badge border text-xs ${ESTADO_COLORS[cot.estado]}`}>{ESTADO_LABELS[cot.estado]}</span>
                    {cot.costoRealEstado && (
                      <span className={`badge border text-xs ${ESTADO_COLORS[cot.costoRealEstado]}`}>Costo real: {ESTADO_LABELS[cot.costoRealEstado]}</span>
                    )}
                  </div>
                </div>
              </div>
            </button>

            {isExpanded && (
              <div className="border-t border-gray-100 bg-gray-50 p-4 space-y-3">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="bg-white rounded-xl p-3 border border-gray-100">
                    <p className="text-xs text-gray-400 mb-0.5">Costo total</p>
                    <p className="font-semibold text-gray-900">${cot.costoTotal.toFixed(2)}</p>
                  </div>
                  <div className="bg-white rounded-xl p-3 border border-gray-100">
                    <p className="text-xs text-gray-400 mb-0.5">Utilidad bruta</p>
                    <p className="font-semibold text-teal-600">${cot.utilidadBruta.toFixed(2)}</p>
                  </div>
                  {cot.costoRealTotal != null && (
                    <div className="bg-white rounded-xl p-3 border border-gray-100 col-span-2">
                      <p className="text-xs text-gray-400 mb-0.5">Costo real</p>
                      <p className="font-semibold text-gray-900">
                        ${cot.costoRealTotal.toFixed(2)} · Utilidad real: ${(cot.montoVenta - cot.costoRealTotal).toFixed(2)}
                      </p>
                    </div>
                  )}
                  {cot.notaAdmin && (
                    <div className="bg-white rounded-xl p-3 border border-gray-100 col-span-2">
                      <p className="text-xs text-gray-400 mb-0.5">Nota del admin</p>
                      <p className="text-gray-700 italic">"{cot.notaAdmin}"</p>
                    </div>
                  )}
                </div>

                <div className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-50">
                  {cot.items.map(it => (
                    <div key={it.id} className={`flex justify-between px-3 py-2 text-sm ${!it.incluido ? 'opacity-40' : ''}`}>
                      <span className="text-gray-700">{it.descripcion} {it.ancho ? `(${it.ancho}×${it.alto}m)` : ''} × {it.cantidad}</span>
                      <span className="font-medium text-gray-900">${(it.precioUnitario * it.cantidad).toFixed(2)}</span>
                    </div>
                  ))}
                </div>

                {cot.facturasCostoReal.length > 0 && (
                  <div className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-50">
                    {cot.facturasCostoReal.map(f => (
                      <div key={f.id} className="flex justify-between px-3 py-2 text-sm">
                        <span className="text-gray-700">{f.descripcion ?? f.proveedor ?? 'Factura'}</span>
                        <span className="flex items-center gap-2">
                          <span className="font-medium text-gray-900">${f.monto.toFixed(2)}</span>
                          {f.archivoPath && (
                            <a href={`/api/fotos?path=${encodeURIComponent(f.archivoPath)}`} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline text-xs">Ver</a>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {esAdmin && cot.estado === 'PENDIENTE' && (
                  <AprobarPanel etiqueta="Aprobar / rechazar cotización"
                    onAprobar={nota => aprobar(cot.id, 'APROBADA', nota)}
                    onRechazar={nota => aprobar(cot.id, 'RECHAZADA', nota)} />
                )}

                {puedeSubirCostoReal && <CostoRealForm cot={cot} onDone={actualizarCot} />}

                {esAdmin && cot.costoRealEstado === 'PENDIENTE' && (
                  <AprobarPanel etiqueta="Aprobar / rechazar costo real"
                    onAprobar={nota => aprobarCostoReal(cot.id, 'APROBADO', nota)}
                    onRechazar={nota => aprobarCostoReal(cot.id, 'RECHAZADO', nota)} />
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

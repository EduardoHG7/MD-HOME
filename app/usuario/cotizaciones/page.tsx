'use client'

import { useEffect, useState } from 'react'
import { formatDate } from '@/lib/utils'

interface CotFact    { id: string; descripcion: string; proveedor: string; monto: number }
interface Cotizacion { id: string; descripcion: string | null; estado: string; notaAdmin: string | null; montoTotal: number; createdAt: string; facturas: CotFact[] }
interface Linea {
  id: string; descripcion: string; nota: string | null; montoUsd: number
  cotizaciones: Cotizacion[]
  categoria: {
    nombre: string
    presupuesto: {
      evento: { id: string; nombre: string; fechaInicio: string; estado: string }
    }
  }
}

const ESTADO_COLORS: Record<string, string> = { PENDIENTE: 'bg-yellow-100 text-yellow-700', APROBADA: 'bg-green-100 text-green-700', RECHAZADA: 'bg-red-100 text-red-600' }
function fmt(n: number) { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(n) }

function NuevaFactura({ onChange }: { onChange: (f: CotFact[]) => void }) {
  const [facturas, setFacturas] = useState<CotFact[]>([{ id: '', descripcion: '', proveedor: '', monto: 0 }])
  useEffect(() => { onChange(facturas) }, [facturas, onChange])
  return (
    <div className="space-y-2">
      {facturas.map((f, fi) => (
        <div key={fi} className="grid grid-cols-3 gap-2 items-center">
          <input className="input col-span-1" placeholder="Descripción *" value={f.descripcion}
            onChange={e => setFacturas(prev => prev.map((x,xi) => xi===fi ? {...x, descripcion: e.target.value} : x))} />
          <input className="input" placeholder="Proveedor" value={f.proveedor}
            onChange={e => setFacturas(prev => prev.map((x,xi) => xi===fi ? {...x, proveedor: e.target.value} : x))} />
          <div className="flex gap-2">
            <input type="number" className="input" placeholder="Monto $" value={f.monto || ''}
              onChange={e => setFacturas(prev => prev.map((x,xi) => xi===fi ? {...x, monto: parseFloat(e.target.value)||0} : x))} />
            {facturas.length > 1 && (
              <button type="button" onClick={() => setFacturas(prev => prev.filter((_,xi) => xi!==fi))} className="text-red-400 hover:text-red-600">✕</button>
            )}
          </div>
        </div>
      ))}
      <button type="button" onClick={() => setFacturas(prev => [...prev, { id:'', descripcion:'', proveedor:'', monto: 0 }])}
        className="text-xs text-blue-500 hover:underline">+ Agregar factura</button>
    </div>
  )
}

export default function CotizacionesPage() {
  const [lineas,    setLineas]    = useState<Linea[]>([])
  const [loading,   setLoading]   = useState(true)
  const [selected,  setSelected]  = useState<Linea | null>(null)
  const [showForm,  setShowForm]  = useState(false)
  const [desc,      setDesc]      = useState('')
  const [facturas,  setFacturas]  = useState<CotFact[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error,     setError]     = useState('')

  useEffect(() => {
    fetch('/api/mis-asignaciones').then(r => r.json()).then(d => { setLineas(Array.isArray(d) ? d : []); setLoading(false) })
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selected) return
    if (!facturas.length || facturas.some(f => !f.descripcion || !f.monto)) {
      setError('Completa todas las facturas con descripción y monto'); return
    }
    setSubmitting(true); setError('')
    const res = await fetch('/api/cotizaciones', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lineaId: selected.id, descripcion: desc, facturas }),
    })
    if (res.ok) {
      const nueva = await res.json()
      setLineas(prev => prev.map(l => l.id === selected.id
        ? { ...l, cotizaciones: [nueva, ...l.cotizaciones] } : l))
      setSelected(prev => prev ? { ...prev, cotizaciones: [nueva, ...(prev.cotizaciones ?? [])] } : prev)
      setShowForm(false); setDesc(''); setFacturas([])
    } else { setError('Error al enviar la cotización') }
    setSubmitting(false)
  }

  async function eliminarCot(lineaId: string, cotId: string) {
    if (!confirm('¿Eliminar esta cotización?')) return
    const res = await fetch(`/api/cotizaciones/${cotId}`, { method: 'DELETE' })
    if (res.ok) {
      setLineas(prev => prev.map(l => l.id === lineaId ? { ...l, cotizaciones: l.cotizaciones.filter(c => c.id !== cotId) } : l))
      setSelected(prev => prev && prev.id === lineaId ? { ...prev, cotizaciones: prev.cotizaciones.filter(c => c.id !== cotId) } : prev)
    }
  }

  // Agrupar por evento
  const porEvento: Record<string, { evento: Linea['categoria']['presupuesto']['evento']; lineas: Linea[] }> = {}
  for (const l of lineas) {
    const ev = l.categoria.presupuesto.evento
    if (!porEvento[ev.id]) porEvento[ev.id] = { evento: ev, lineas: [] }
    porEvento[ev.id].lineas.push(l)
  }

  if (loading) return <div className="text-gray-400 animate-pulse text-center py-16">Cargando asignaciones...</div>

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Mis Subcategorías Asignadas</h1>
        <p className="text-gray-500 mt-1">Carga tus cotizaciones para aprobación del administrador</p>
      </div>

      {lineas.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-4xl mb-3">📋</p>
          <p className="text-gray-700 font-semibold">No tienes subcategorías asignadas</p>
          <p className="text-gray-400 text-sm mt-1">El administrador te asignará categorías de presupuesto próximamente.</p>
        </div>
      ) : (
        <div className="grid grid-cols-5 gap-6">
          {/* Lista */}
          <div className="col-span-2 space-y-4">
            {Object.values(porEvento).map(({ evento, lineas: evLineas }) => (
              <div key={evento.id}>
                <div className="flex items-center gap-2 mb-2">
                  <p className="font-semibold text-gray-900 text-sm">{evento.nombre}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${evento.estado === 'ACTIVO' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{evento.estado}</span>
                </div>
                <p className="text-gray-400 text-xs mb-2">{formatDate(evento.fechaInicio)}</p>
                <div className="space-y-1.5">
                  {evLineas.map(l => {
                    const aprobado  = l.cotizaciones.filter(c => c.estado === 'APROBADA').reduce((s,c) => s+c.montoTotal, 0)
                    const pendiente = l.cotizaciones.filter(c => c.estado === 'PENDIENTE').length
                    return (
                      <button key={l.id} onClick={() => { setSelected(l); setShowForm(false) }}
                        className={`card w-full text-left p-3 hover:border-gray-400 transition-all ${selected?.id === l.id ? 'border-gray-400 shadow-sm' : ''}`}>
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="text-xs text-gray-400">{l.categoria.nombre}</p>
                            <p className="font-medium text-gray-900 text-sm">{l.descripcion}</p>
                            <p className="text-gray-400 text-xs mt-0.5">Presup.: {fmt(l.montoUsd)}</p>
                          </div>
                          <div className="text-right shrink-0 ml-2">
                            <p className="text-sm font-bold text-green-600">{fmt(aprobado)}</p>
                            {pendiente > 0 && <p className="text-xs text-yellow-600">{pendiente} pendiente(s)</p>}
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
                  <form onSubmit={handleSubmit} className="space-y-4 border-t border-gray-100 pt-4">
                    <div>
                      <label className="label">Descripción general (opcional)</label>
                      <input className="input" placeholder="Ej: Pauta radio agosto semana 1..." value={desc} onChange={e => setDesc(e.target.value)} />
                    </div>
                    <div>
                      <label className="label">Facturas / Cotizaciones *</label>
                      <p className="text-gray-400 text-xs mb-2">Puedes cargar 1 o varias facturas que sumen al total</p>
                      <NuevaFactura onChange={setFacturas} />
                    </div>
                    {error && <p className="text-red-500 text-sm">{error}</p>}
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-gray-700">
                        Total: {fmt(facturas.reduce((s,f)=>s+f.monto,0))}
                      </p>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => { setShowForm(false); setError('') }} className="btn-ghost text-sm">Cancelar</button>
                        <button type="submit" disabled={submitting} className="btn-primary text-sm">
                          {submitting ? 'Enviando...' : 'Enviar para aprobación'}
                        </button>
                      </div>
                    </div>
                  </form>
                )}
              </div>

              {/* Historial cotizaciones */}
              {selected.cotizaciones.length > 0 && (
                <div className="card p-5">
                  <h4 className="font-semibold text-gray-700 text-sm mb-3">Historial de Cotizaciones</h4>
                  <div className="space-y-3">
                    {selected.cotizaciones.map(cot => (
                      <div key={cot.id} className="bg-gray-50 rounded-xl p-4">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ESTADO_COLORS[cot.estado]}`}>{cot.estado}</span>
                            <p className="text-xs text-gray-400 mt-1">{new Date(cot.createdAt).toLocaleDateString('es-PA')}</p>
                            {cot.descripcion && <p className="text-sm text-gray-600 mt-1">{cot.descripcion}</p>}
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-gray-900">{fmt(cot.montoTotal)}</p>
                            {cot.estado === 'PENDIENTE' && (
                              <button onClick={() => eliminarCot(selected.id, cot.id)} className="text-xs text-red-400 hover:text-red-600 mt-1">Eliminar</button>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {cot.facturas.map(f => (
                            <span key={f.id} className="text-xs bg-white border border-gray-200 rounded-lg px-2 py-1 text-gray-600">
                              {f.descripcion}{f.proveedor ? ` (${f.proveedor})` : ''} — {fmt(f.monto)}
                            </span>
                          ))}
                        </div>
                        {cot.notaAdmin && (
                          <div className="mt-2 pt-2 border-t border-gray-200">
                            <p className="text-xs text-gray-500 italic">Admin: "{cot.notaAdmin}"</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

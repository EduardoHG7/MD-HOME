'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  calcularItem, calcularResumen,
  type ProductoCalc, type MaterialCalc, type NivelPrecio,
} from '@/lib/cotizadorPM'

interface Cliente { id: string; nombreEmpresa: string; nombreContacto: string; telefono: string; correo: string }
interface Evento  { id: string; nombre: string }
interface ProductoPM {
  id: string; nombre: string; formula: 'AREA' | 'AREA_PERIMETRO'
  manoObra: number; margenA: number; margenB: number; margenC: number
  materiales: { materialId: string; cantidadPorM2: number; cantidadPorMetroPerimetro: number }[]
}
interface MaterialPM { id: string; nombre: string; unidad: string; costoUnitario: number }

interface ItemForm {
  key: string
  productoId: string | null // null = manual
  descripcion: string
  ancho: string
  alto: string
  cantidad: string
  incluyeInstalacion: boolean
  incluyeDiseno: boolean
  incluido: boolean
  costoUnitarioManual: string
  precioUnitarioManual: string
}

const ITEM_VACIO = (): ItemForm => ({
  key: crypto.randomUUID(), productoId: null, descripcion: '', ancho: '1', alto: '1', cantidad: '1',
  incluyeInstalacion: false, incluyeDiseno: false, incluido: true,
  costoUnitarioManual: '0', precioUnitarioManual: '0',
})

export function CotizadorForm({ onCreated }: { onCreated: () => void }) {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [eventos, setEventos] = useState<Evento[]>([])
  const [productos, setProductos] = useState<ProductoPM[]>([])
  const [materiales, setMateriales] = useState<MaterialPM[]>([])

  const [nombreTrabajo, setNombreTrabajo] = useState('')
  const [clienteId, setClienteId] = useState('')
  const [clienteManual, setClienteManual] = useState(false)
  const [clienteNombre, setClienteNombre] = useState('')
  const [clienteContacto, setClienteContacto] = useState('')
  const [clienteTelefono, setClienteTelefono] = useState('')
  const [clienteCorreo, setClienteCorreo] = useState('')
  const [nivelPrecio, setNivelPrecio] = useState<NivelPrecio>('B')
  const [eventoId, setEventoId] = useState('')
  const [vigenciaDias, setVigenciaDias] = useState('15')
  const [carpetaDriveUrl, setCarpetaDriveUrl] = useState('')
  const [notas, setNotas] = useState('')
  const [fechaEntrega, setFechaEntrega] = useState('')
  const [transporte, setTransporte] = useState('0')
  const [costosIndirectosPct, setCostosIndirectosPct] = useState('8')
  const [items, setItems] = useState<ItemForm[]>([])
  const [nuevoItem, setNuevoItem] = useState<ItemForm>(ITEM_VACIO())

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/clientes').then(r => r.json()).then(d => setClientes(Array.isArray(d) ? d : []))
    fetch('/api/eventos').then(r => r.json()).then(d => setEventos(Array.isArray(d) ? d : []))
    fetch('/api/pm/productos').then(r => r.json()).then(d => setProductos(Array.isArray(d) ? d : []))
    fetch('/api/pm/materiales').then(r => r.json()).then(d => setMateriales(Array.isArray(d) ? d : []))
  }, [])

  const productosPorId = useMemo<Record<string, ProductoCalc>>(() => Object.fromEntries(
    productos.map(p => [p.id, { id: p.id, formula: p.formula, manoObra: p.manoObra, margenA: p.margenA, margenB: p.margenB, margenC: p.margenC, materiales: p.materiales }])
  ), [productos])
  const materialesPorId = useMemo<Record<string, MaterialCalc>>(() => Object.fromEntries(
    materiales.map(m => [m.id, { id: m.id, costoUnitario: m.costoUnitario }])
  ), [materiales])

  function calcularFila(it: ItemForm) {
    return calcularItem(
      {
        productoId: it.productoId, ancho: parseFloat(it.ancho) || 0, alto: parseFloat(it.alto) || 0,
        cantidad: parseInt(it.cantidad) || 1, incluido: it.incluido,
        costoUnitarioManual: parseFloat(it.costoUnitarioManual) || 0,
        precioUnitarioManual: parseFloat(it.precioUnitarioManual) || 0,
      },
      nivelPrecio, productosPorId, materialesPorId,
    )
  }

  const itemsCalculados = items.map(it => ({ ...it, ...calcularFila(it), cantidadNum: parseInt(it.cantidad) || 1 }))
  const resumen = calcularResumen(
    itemsCalculados.map(it => ({ costoUnitario: it.costoUnitario, precioUnitario: it.precioUnitario, cantidad: it.cantidadNum, incluido: it.incluido })),
    parseFloat(transporte) || 0, parseFloat(costosIndirectosPct) || 0,
  )

  function seleccionarCliente(id: string) {
    setClienteId(id)
    setClienteManual(id === '__manual__')
    if (id && id !== '__manual__') {
      const c = clientes.find(c => c.id === id)
      if (c) {
        setClienteNombre(c.nombreEmpresa); setClienteContacto(c.nombreContacto)
        setClienteTelefono(c.telefono); setClienteCorreo(c.correo)
      }
    }
  }

  function agregarItem() {
    let descripcion = nuevoItem.descripcion
    if (nuevoItem.productoId && !descripcion) {
      descripcion = productos.find(p => p.id === nuevoItem.productoId)?.nombre ?? ''
    }
    if (!descripcion.trim()) { setError('Describe el ítem o elige un producto.'); return }
    setItems(prev => [...prev, { ...nuevoItem, descripcion, key: crypto.randomUUID() }])
    setNuevoItem(ITEM_VACIO())
    setError('')
  }

  function quitarItem(key: string) { setItems(prev => prev.filter(i => i.key !== key)) }
  function toggleIncluido(key: string) { setItems(prev => prev.map(i => i.key === key ? { ...i, incluido: !i.incluido } : i)) }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!nombreTrabajo.trim()) { setError('Indica el nombre del trabajo.'); return }
    if (!clienteNombre.trim()) { setError('Indica el cliente.'); return }
    if (items.length === 0) { setError('Agrega al menos un ítem.'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/pm/cotizaciones', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombreTrabajo, clienteId: clienteManual ? null : (clienteId || null),
          clienteNombre, clienteContacto, clienteTelefono, clienteCorreo,
          nivelPrecio, eventoId: eventoId || null, vigenciaDias, carpetaDriveUrl, notas,
          transporte, costosIndirectosPct, fechaEntrega: fechaEntrega || null,
          items: items.map(it => ({
            productoId: it.productoId, descripcion: it.descripcion,
            ancho: parseFloat(it.ancho) || 0, alto: parseFloat(it.alto) || 0,
            cantidad: parseInt(it.cantidad) || 1,
            incluyeInstalacion: it.incluyeInstalacion, incluyeDiseno: it.incluyeDiseno, incluido: it.incluido,
            costoUnitarioManual: parseFloat(it.costoUnitarioManual) || 0,
            precioUnitarioManual: parseFloat(it.precioUnitarioManual) || 0,
          })),
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) { setError(data?.error ?? 'Error al crear la cotización'); return }
      setNombreTrabajo(''); setClienteId(''); setClienteManual(false)
      setClienteNombre(''); setClienteContacto(''); setClienteTelefono(''); setClienteCorreo('')
      setEventoId(''); setCarpetaDriveUrl(''); setNotas(''); setFechaEntrega('')
      setTransporte('0'); setCostosIndirectosPct('8'); setItems([])
      onCreated()
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="card p-5 space-y-4">
        <h2 className="font-semibold text-gray-900">Datos de la cotización</h2>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="label">Nombre del trabajo *</label>
            <input className="input" placeholder='Ej: "Banner tarima principal"' value={nombreTrabajo}
              onChange={e => setNombreTrabajo(e.target.value)} required />
          </div>
          <div>
            <label className="label">Cliente *</label>
            <select className="input" value={clienteId} onChange={e => seleccionarCliente(e.target.value)}>
              <option value="">Seleccionar cliente...</option>
              {clientes.map(c => <option key={c.id} value={c.id}>{c.nombreEmpresa}</option>)}
              <option value="__manual__">Otro (escribir manualmente)</option>
            </select>
            {clienteManual && (
              <input className="input mt-2" placeholder="Nombre del cliente/empresa" value={clienteNombre}
                onChange={e => setClienteNombre(e.target.value)} required />
            )}
          </div>
          <div>
            <label className="label">Nivel de precio</label>
            <div className="grid grid-cols-3 gap-1.5">
              {(['A', 'B', 'C'] as NivelPrecio[]).map(n => (
                <button type="button" key={n} onClick={() => setNivelPrecio(n)}
                  className={`py-2 rounded-xl text-xs font-semibold border-2 transition-all ${
                    nivelPrecio === n ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 text-gray-500'
                  }`}>
                  {n} · {n === 'A' ? 'Premium' : n === 'B' ? 'Regular' : 'Al Detal'}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="label">Contacto</label>
            <input className="input" placeholder="Teléfono o correo" value={clienteContacto}
              onChange={e => setClienteContacto(e.target.value)} />
          </div>
          <div>
            <label className="label">Evento (opcional)</label>
            <select className="input" value={eventoId} onChange={e => setEventoId(e.target.value)}>
              <option value="">Sin evento — venta directa</option>
              {eventos.map(ev => <option key={ev.id} value={ev.id}>{ev.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Vigencia (días)</label>
            <input className="input" type="number" min={1} value={vigenciaDias} onChange={e => setVigenciaDias(e.target.value)} />
          </div>
          <div>
            <label className="label">Fecha de entrega del trabajo</label>
            <input className="input" type="date" value={fechaEntrega} onChange={e => setFechaEntrega(e.target.value)} />
          </div>
          <div className="col-span-2">
            <label className="label">Carpeta de Drive (enlace, opcional)</label>
            <input className="input" placeholder="https://drive.google.com/..." value={carpetaDriveUrl}
              onChange={e => setCarpetaDriveUrl(e.target.value)} />
          </div>
          <div className="col-span-2">
            <label className="label">Notas</label>
            <textarea className="input resize-none h-20" placeholder="Condiciones, tiempo de entrega, forma de pago..."
              value={notas} onChange={e => setNotas(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="card p-5 space-y-3">
        <h2 className="font-semibold text-gray-900">Agregar ítem</h2>
        <p className="text-gray-400 text-xs">Elige un producto paramétrico (calcula materiales por medidas) o agrega un ítem manual.</p>
        <div className="grid grid-cols-4 gap-3">
          <div className="col-span-2">
            <label className="label">Producto</label>
            <select className="input" value={nuevoItem.productoId ?? '__manual__'}
              onChange={e => setNuevoItem(f => ({ ...f, productoId: e.target.value === '__manual__' ? null : e.target.value, descripcion: '' }))}>
              {productos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              <option value="__manual__">✏️ Ítem manual</option>
            </select>
          </div>
          {!nuevoItem.productoId ? (
            <div className="col-span-2">
              <label className="label">Descripción *</label>
              <input className="input" value={nuevoItem.descripcion} onChange={e => setNuevoItem(f => ({ ...f, descripcion: e.target.value }))} />
            </div>
          ) : (
            <>
              <div>
                <label className="label">Ancho (m)</label>
                <input className="input" type="number" step="0.01" min="0" value={nuevoItem.ancho} onChange={e => setNuevoItem(f => ({ ...f, ancho: e.target.value }))} />
              </div>
              <div>
                <label className="label">Alto (m)</label>
                <input className="input" type="number" step="0.01" min="0" value={nuevoItem.alto} onChange={e => setNuevoItem(f => ({ ...f, alto: e.target.value }))} />
              </div>
            </>
          )}
          <div>
            <label className="label">Cantidad</label>
            <input className="input" type="number" min="1" value={nuevoItem.cantidad} onChange={e => setNuevoItem(f => ({ ...f, cantidad: e.target.value }))} />
          </div>
          {!nuevoItem.productoId && (
            <>
              <div>
                <label className="label">Costo unitario</label>
                <input className="input" type="number" step="0.01" min="0" value={nuevoItem.costoUnitarioManual}
                  onChange={e => setNuevoItem(f => ({ ...f, costoUnitarioManual: e.target.value }))} />
              </div>
              <div>
                <label className="label">Precio unitario</label>
                <input className="input" type="number" step="0.01" min="0" value={nuevoItem.precioUnitarioManual}
                  onChange={e => setNuevoItem(f => ({ ...f, precioUnitarioManual: e.target.value }))} />
              </div>
            </>
          )}
        </div>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-1.5 text-xs text-gray-500">
            <input type="checkbox" checked={nuevoItem.incluyeInstalacion} onChange={e => setNuevoItem(f => ({ ...f, incluyeInstalacion: e.target.checked }))} />
            Incluye instalación
          </label>
          <label className="flex items-center gap-1.5 text-xs text-gray-500">
            <input type="checkbox" checked={nuevoItem.incluyeDiseno} onChange={e => setNuevoItem(f => ({ ...f, incluyeDiseno: e.target.checked }))} />
            Incluye diseño
          </label>
        </div>
        <button type="button" onClick={agregarItem} className="btn-primary">+ Agregar a la cotización</button>
      </div>

      <div className="card p-5">
        <h2 className="font-semibold text-gray-900 mb-1">Ítems de la cotización</h2>
        <p className="text-gray-400 text-xs mb-3">Desmarca la casilla para excluir un ítem del total sin borrarlo.</p>
        {itemsCalculados.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-4">Todavía no hay ítems. Agrega el primero arriba.</p>
        ) : (
          <div className="space-y-2">
            {itemsCalculados.map(it => (
              <div key={it.key} className={`flex items-center gap-3 p-3 rounded-xl border ${it.incluido ? 'border-gray-200' : 'border-gray-100 opacity-50'}`}>
                <input type="checkbox" checked={it.incluido} onChange={() => toggleIncluido(it.key)} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{it.descripcion}</p>
                  <p className="text-xs text-gray-400">
                    {it.productoId ? `${it.ancho}m × ${it.alto}m · ` : ''}Cant: {it.cantidadNum}
                    {it.incluyeInstalacion ? ' · +Instalación' : ''}{it.incluyeDiseno ? ' · +Diseño' : ''}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-gray-400">Costo: ${it.costoUnitario.toFixed(2)}</p>
                  <p className="text-sm font-semibold text-gray-900">${it.precioUnitario.toFixed(2)} c/u</p>
                </div>
                <button type="button" onClick={() => quitarItem(it.key)} className="text-red-400 hover:text-red-600 text-sm shrink-0">✕</button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-5">
        <div className="card p-5 space-y-3">
          <h2 className="font-semibold text-gray-900">Costos de la cotización</h2>
          <p className="text-gray-400 text-xs">Transporte y costos indirectos se suman una sola vez, no por ítem.</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Transporte ($)</label>
              <input className="input" type="number" step="0.01" min="0" value={transporte} onChange={e => setTransporte(e.target.value)} />
            </div>
            <div>
              <label className="label">Costos indirectos (%)</label>
              <input className="input" type="number" step="0.1" min="0" value={costosIndirectosPct} onChange={e => setCostosIndirectosPct(e.target.value)} />
            </div>
          </div>
        </div>

        <div className="card p-5 space-y-2">
          <h2 className="font-semibold text-gray-900 mb-1">Resumen</h2>
          <ResumenLinea label="Costo materiales y m.o." valor={resumen.costoItems} />
          <ResumenLinea label="Transporte" valor={resumen.transporte} />
          <ResumenLinea label="Costos indirectos" valor={resumen.indirectos} />
          <ResumenLinea label="Costo total" valor={resumen.costoTotal} fuerte />
          <div className="border-t border-gray-100 my-2" />
          <div className="flex justify-between items-baseline">
            <span className="text-gray-500 text-sm">Total a cobrar</span>
            <span className="text-2xl font-bold text-gray-900">${resumen.montoVenta.toFixed(2)}</span>
          </div>
          <div className="bg-teal-50 border border-teal-100 rounded-xl px-3 py-2 flex justify-between items-center mt-2">
            <span className="text-teal-700 text-sm font-medium">Utilidad bruta / Margen</span>
            <span className="text-teal-700 font-bold">${resumen.utilidadBruta.toFixed(2)} · {resumen.margenPct.toFixed(1)}%</span>
          </div>
        </div>
      </div>

      {error && <p className="text-red-500 text-sm">{error}</p>}
      <button type="submit" disabled={loading} className="btn-primary w-full">
        {loading ? 'Enviando...' : 'Enviar cotización para aprobación'}
      </button>
    </form>
  )
}

function ResumenLinea({ label, valor, fuerte }: { label: string; valor: number; fuerte?: boolean }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-gray-500">{label}</span>
      <span className={fuerte ? 'font-semibold text-gray-900' : 'text-gray-700'}>${valor.toFixed(2)}</span>
    </div>
  )
}

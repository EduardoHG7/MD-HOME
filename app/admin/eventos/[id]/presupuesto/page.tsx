'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'

/* ─── Types ─── */
interface Linea      { id?: string; descripcion: string; nota: string; montoLocal: number; montoUsd: number; confianza?: string }
interface Categoria  { id?: string; nombre: string; lineas: Linea[] }
interface TicketZona { id?: string; scaling: string; zona: string; capacity: number; killsBlocks: number; comps: number; ticketPriceLocal: number; ticketPriceUsd: number }
interface Patrocinio { id?: string; nombre: string; montoLocal: number; montoUsd: number; notas: string }
interface Header     { artista: string; pais: string; ciudad: string; promotor: string; moneda: string; exchangeRate: number; numShows: number }

const emptyHeader: Header = { artista: '', pais: '', ciudad: '', promotor: '', moneda: 'USD', exchangeRate: 1, numShows: 1 }

function fmt(n: number) { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(n) }
function num(v: unknown) { const n = Number(v); return isNaN(n) ? 0 : n }

/* ─── KPI Card ─── */
function KpiCard({ label, value, sub, color = 'gray' }: { label: string; value: string; sub?: string; color?: string }) {
  const colors: Record<string, string> = {
    gray:   'border-l-gray-400',
    green:  'border-l-green-400',
    red:    'border-l-red-400',
    amber:  'border-l-amber-400',
    blue:   'border-l-blue-400',
    purple: 'border-l-purple-400',
  }
  return (
    <div className={`card p-4 border-l-4 ${colors[color] ?? colors.gray}`}>
      <p className="text-gray-500 text-xs mb-1">{label}</p>
      <p className="text-xl font-bold text-gray-900">{value}</p>
      {sub && <p className="text-gray-400 text-xs mt-0.5">{sub}</p>}
    </div>
  )
}

/* ─── Categoria Acordeón ─── */
function CategoriaRow({ cat, idx, rate, onChange, onDelete }: {
  cat: Categoria; idx: number; rate: number
  onChange: (c: Categoria) => void
  onDelete: () => void
}) {
  const [open, setOpen] = useState(false)
  const totalLocal = cat.lineas.reduce((s, l) => s + num(l.montoLocal), 0)
  const totalUsd   = cat.lineas.reduce((s, l) => s + num(l.montoUsd), 0)

  function updateLinea(li: number, field: keyof Linea, val: string | number) {
    const lineas = cat.lineas.map((l, i) => {
      if (i !== li) return l
      const updated = { ...l, [field]: val }
      if (field === 'montoLocal') updated.montoUsd = rate ? num(val) / rate : 0
      if (field === 'montoUsd')   updated.montoLocal = rate ? num(val) * rate : 0
      return updated
    })
    onChange({ ...cat, lineas })
  }

  function addLinea() {
    onChange({ ...cat, lineas: [...cat.lineas, { descripcion: '', nota: '', montoLocal: 0, montoUsd: 0 }] })
  }

  function deleteLinea(li: number) {
    onChange({ ...cat, lineas: cat.lineas.filter((_, i) => i !== li) })
  }

  return (
    <div className="card overflow-hidden">
      <button type="button" onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors">
        <div className="flex items-center gap-3">
          <span className="text-gray-400 text-sm">{open ? '▼' : '▶'}</span>
          <input
            className="font-semibold text-gray-900 bg-transparent border-none outline-none text-sm w-48"
            value={cat.nombre}
            onClick={e => e.stopPropagation()}
            onChange={e => onChange({ ...cat, nombre: e.target.value })}
          />
          <span className="text-xs text-gray-400">{cat.lineas.length} ítem(s)</span>
        </div>
        <div className="flex items-center gap-6 text-sm">
          <span className="text-gray-500">{fmt(totalUsd)}</span>
          <button type="button" onClick={e => { e.stopPropagation(); onDelete() }}
            className="text-red-300 hover:text-red-500 text-xs px-2 py-1 rounded hover:bg-red-50 transition-all">✕</button>
        </div>
      </button>

      {open && (
        <div className="border-t border-gray-100">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-400 text-xs">
                <th className="px-4 py-2 text-left">Descripción</th>
                <th className="px-4 py-2 text-left">Nota</th>
                <th className="px-4 py-2 text-right">Monto Local</th>
                <th className="px-4 py-2 text-right">Monto USD</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {cat.lineas.map((l, li) => (
                <tr key={li} className={`hover:bg-gray-50 ${l.confianza === 'LOW' ? 'bg-amber-50' : ''}`}>
                  <td className="px-4 py-2">
                    <input className="w-full bg-transparent outline-none border-b border-transparent focus:border-gray-300 text-gray-900"
                      value={l.descripcion} onChange={e => updateLinea(li, 'descripcion', e.target.value)} />
                    {l.confianza === 'LOW' && <span className="text-amber-500 text-xs">⚠ Revisar</span>}
                  </td>
                  <td className="px-4 py-2">
                    <input className="w-full bg-transparent outline-none border-b border-transparent focus:border-gray-300 text-gray-500 text-xs"
                      value={l.nota} onChange={e => updateLinea(li, 'nota', e.target.value)} />
                  </td>
                  <td className="px-4 py-2">
                    <input type="number" className="w-28 bg-transparent outline-none border-b border-transparent focus:border-gray-300 text-right text-gray-900"
                      value={l.montoLocal} onChange={e => updateLinea(li, 'montoLocal', parseFloat(e.target.value) || 0)} />
                  </td>
                  <td className="px-4 py-2">
                    <input type="number" className="w-28 bg-transparent outline-none border-b border-transparent focus:border-gray-300 text-right text-gray-900"
                      value={l.montoUsd} onChange={e => updateLinea(li, 'montoUsd', parseFloat(e.target.value) || 0)} />
                  </td>
                  <td className="px-2 py-2">
                    <button type="button" onClick={() => deleteLinea(li)} className="text-red-300 hover:text-red-500">✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 font-semibold text-sm">
                <td className="px-4 py-2 text-gray-500" colSpan={2}>
                  <button type="button" onClick={addLinea} className="text-xs text-blue-500 hover:underline">+ Agregar línea</button>
                </td>
                <td className="px-4 py-2 text-right text-gray-700">{totalLocal.toLocaleString()}</td>
                <td className="px-4 py-2 text-right text-gray-900">{fmt(totalUsd)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}

/* ─── Página principal ─── */
export default function PresupuestoPage() {
  const { id: eventoId } = useParams<{ id: string }>()
  const router = useRouter()

  const [header,      setHeader]      = useState<Header>(emptyHeader)
  const [artistG,     setArtistG]     = useState(0)
  const [categorias,  setCategorias]  = useState<Categoria[]>([])
  const [ticketZonas, setTicketZonas] = useState<TicketZona[]>([])
  const [patrocinios, setPatrocinios] = useState<Patrocinio[]>([])

  const [loading,     setLoading]     = useState(true)
  const [saving,      setSaving]      = useState(false)
  const [extracting,  setExtracting]  = useState(false)
  const [extractError, setExtractError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const loadPresupuesto = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/presupuestos/${eventoId}`)
    if (res.ok) {
      const data = await res.json()
      if (data) {
        setHeader({ artista: data.artista ?? '', pais: data.pais ?? '', ciudad: data.ciudad ?? '', promotor: data.promotor ?? '', moneda: data.moneda ?? 'USD', exchangeRate: data.exchangeRate ?? 1, numShows: data.numShows ?? 1 })
        setArtistG(data.artistGuarantee ?? 0)
        setCategorias(data.categorias?.map((c: Categoria & { lineas: Linea[] }) => ({ ...c, lineas: c.lineas ?? [] })) ?? [])
        setTicketZonas(data.ticketZonas ?? [])
        setPatrocinios(data.patrocinios?.map((p: Patrocinio) => ({ ...p, notas: p.notas ?? '' })) ?? [])
      }
    }
    setLoading(false)
  }, [eventoId])

  useEffect(() => { loadPresupuesto() }, [loadPresupuesto])

  async function handleSave() {
    setSaving(true)
    await fetch(`/api/presupuestos/${eventoId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...header, artistGuarantee: artistG, categorias, ticketZonas, patrocinios }),
    })
    setSaving(false)
  }

  async function handleFileUpload(file: File) {
    setExtracting(true)
    setExtractError('')
    try {
      const base64 = await new Promise<string>((res, rej) => {
        const r = new FileReader()
        r.onload  = () => res((r.result as string).split(',')[1])
        r.onerror = rej
        r.readAsDataURL(file)
      })
      const resp = await fetch('/api/presupuestos/extract', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64, mimeType: file.type, fileName: file.name }),
      })
      const data = await resp.json()
      if (!resp.ok) { setExtractError(data.error ?? 'Error al procesar'); return }

      if (data.header) {
        setHeader({
          artista:      data.header.artista      ?? '',
          pais:         data.header.pais         ?? '',
          ciudad:       data.header.ciudad       ?? '',
          promotor:     data.header.promotor     ?? '',
          moneda:       data.header.moneda       ?? 'USD',
          exchangeRate: data.header.exchangeRate ?? 1,
          numShows:     data.header.numShows     ?? 1,
        })
      }
      if (data.artistGuarantee) setArtistG(data.artistGuarantee)
      if (data.categorias?.length)  setCategorias(data.categorias.map((c: Categoria) => ({ ...c, lineas: c.lineas ?? [] })))
      if (data.ticketZonas?.length) setTicketZonas(data.ticketZonas.map((z: TicketZona) => ({ ...z, scaling: z.scaling ?? '' })))
    } catch (e) {
      setExtractError(String(e))
    } finally {
      setExtracting(false)
    }
  }

  /* ─── Cálculos ─── */
  const totalProduccion  = categorias.reduce((s, c) => s + c.lineas.reduce((ss, l) => ss + num(l.montoUsd), 0), 0)
  const estimatedBudget  = artistG + totalProduccion

  const ticketIncome = ticketZonas.reduce((s, z) => {
    const avail = Math.max(0, num(z.capacity) - num(z.killsBlocks) - num(z.comps))
    return s + avail * num(z.ticketPriceUsd)
  }, 0)
  const sponsorIncome    = patrocinios.reduce((s, p) => s + num(p.montoUsd), 0)
  const totalIncome      = ticketIncome + sponsorIncome
  const profitLoss       = totalIncome - estimatedBudget

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-400 animate-pulse">Cargando presupuesto...</div>

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="text-gray-400 hover:text-gray-700 text-sm">← Volver</button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Presupuesto del Evento</h1>
            <p className="text-gray-500 text-sm mt-0.5">Dashboard financiero editable</p>
          </div>
        </div>
        <div className="flex gap-2">
          <label className={`btn-ghost text-sm cursor-pointer ${extracting ? 'opacity-50' : ''}`}>
            {extracting ? '⏳ Procesando...' : '📄 Importar PDF / Imagen / Excel'}
            <input ref={fileRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.xlsx,.xls" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(f) }} />
          </label>
          <button onClick={handleSave} disabled={saving} className="btn-primary text-sm">
            {saving ? 'Guardando...' : '💾 Guardar presupuesto'}
          </button>
        </div>
      </div>

      {extractError && (
        <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl px-4 py-3 text-sm">{extractError}</div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Artist Guarantee"         value={fmt(artistG)}          color="purple" />
        <KpiCard label="Total Gastos de Producción" value={fmt(totalProduccion)} color="amber"  />
        <KpiCard label="Presupuesto Total Estimado" value={fmt(estimatedBudget)} color="amber"  />
        <KpiCard label="Ingreso por Boletos"      value={fmt(ticketIncome)}      color="blue"   />
        <KpiCard label="Ingreso por Patrocinios"  value={fmt(sponsorIncome)}     color="blue"   />
        <KpiCard label="Ingreso Total Estimado"   value={fmt(totalIncome)}       color="green"  />
        <KpiCard label="Utilidad / Pérdida Estimada" value={fmt(profitLoss)}
          color={profitLoss >= 0 ? 'green' : 'red'}
          sub={profitLoss >= 0 ? '✅ Rentable' : '⚠️ Pérdida estimada'} />
      </div>

      {/* Info del evento */}
      <div className="card p-5">
        <h2 className="font-semibold text-gray-900 mb-4">Información del Evento</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          {([
            ['Artista',      'artista'],
            ['País',         'pais'],
            ['Ciudad',       'ciudad'],
            ['Promotor',     'promotor'],
            ['Moneda local', 'moneda'],
            ['Exchange rate','exchangeRate'],
            ['N° de shows',  'numShows'],
          ] as [string, keyof Header][]).map(([label, key]) => (
            <div key={key}>
              <label className="label">{label}</label>
              <input className="input" value={String(header[key] ?? '')}
                type={typeof header[key] === 'number' ? 'number' : 'text'}
                onChange={e => setHeader(h => ({ ...h, [key]: typeof h[key] === 'number' ? parseFloat(e.target.value) || 0 : e.target.value }))} />
            </div>
          ))}
        </div>
      </div>

      {/* Artist Guarantee */}
      <div className="card p-5 border-l-4 border-l-purple-400">
        <h2 className="font-semibold text-gray-900 mb-3">🎤 Artist Guarantee</h2>
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <label className="label">Monto (USD)</label>
            <input type="number" className="input" value={artistG}
              onChange={e => setArtistG(parseFloat(e.target.value) || 0)} />
          </div>
          <div className="text-right">
            <p className="text-gray-400 text-xs">Total</p>
            <p className="text-2xl font-bold text-purple-600">{fmt(artistG)}</p>
          </div>
        </div>
      </div>

      {/* Categorías de costos */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">📊 Presupuesto de Costos</h2>
          <button type="button" onClick={() => setCategorias(prev => [...prev, { nombre: 'NUEVA CATEGORÍA', lineas: [] }])}
            className="text-sm text-blue-500 hover:underline">+ Agregar categoría</button>
        </div>
        {categorias.length === 0 && (
          <div className="card p-8 text-center text-gray-400 text-sm">
            <p className="text-3xl mb-2">📋</p>
            Importa un PDF/imagen o agrega categorías manualmente
          </div>
        )}
        {categorias.map((cat, i) => (
          <CategoriaRow key={i} cat={cat} idx={i} rate={header.exchangeRate}
            onChange={c => setCategorias(prev => prev.map((x, xi) => xi === i ? c : x))}
            onDelete={() => setCategorias(prev => prev.filter((_, xi) => xi !== i))} />
        ))}
        {categorias.length > 0 && (
          <div className="flex justify-end gap-8 px-5 py-3 bg-gray-50 rounded-xl border border-gray-200 text-sm font-semibold">
            <span className="text-gray-500">Total Producción</span>
            <span className="text-gray-900">{fmt(totalProduccion)}</span>
          </div>
        )}
      </div>

      {/* Ticket Scaling */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-900">🎟️ Boletos Disponibles (Ticket Scaling)</h2>
          <button type="button" onClick={() => setTicketZonas(prev => [...prev, { scaling: '', zona: '', capacity: 0, killsBlocks: 0, comps: 0, ticketPriceLocal: 0, ticketPriceUsd: 0 }])}
            className="text-sm text-blue-500 hover:underline">+ Agregar zona</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-400 text-xs">
                <th className="px-3 py-2 text-left">Scaling</th>
                <th className="px-3 py-2 text-left">Zona</th>
                <th className="px-3 py-2 text-right">Capacity</th>
                <th className="px-3 py-2 text-right">Kills/Blocks</th>
                <th className="px-3 py-2 text-right">Comps</th>
                <th className="px-3 py-2 text-right">Available</th>
                <th className="px-3 py-2 text-right">Price Local</th>
                <th className="px-3 py-2 text-right">Price USD</th>
                <th className="px-3 py-2 text-right">Gross USD</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {ticketZonas.map((z, zi) => {
                const avail = Math.max(0, num(z.capacity) - num(z.killsBlocks) - num(z.comps))
                const gross = avail * num(z.ticketPriceUsd)
                function upd(field: keyof TicketZona, val: string | number) {
                  setTicketZonas(prev => prev.map((x, xi) => xi === zi ? { ...x, [field]: val } : x))
                }
                return (
                  <tr key={zi} className="hover:bg-gray-50">
                    <td className="px-3 py-2"><input className="w-16 bg-transparent outline-none border-b border-transparent focus:border-gray-300" value={z.scaling} onChange={e => upd('scaling', e.target.value)} /></td>
                    <td className="px-3 py-2"><input className="w-28 bg-transparent outline-none border-b border-transparent focus:border-gray-300 font-medium" value={z.zona} onChange={e => upd('zona', e.target.value)} /></td>
                    <td className="px-3 py-2"><input type="number" className="w-20 bg-transparent outline-none border-b border-transparent focus:border-gray-300 text-right" value={z.capacity} onChange={e => upd('capacity', parseInt(e.target.value)||0)} /></td>
                    <td className="px-3 py-2"><input type="number" className="w-20 bg-transparent outline-none border-b border-transparent focus:border-gray-300 text-right" value={z.killsBlocks} onChange={e => upd('killsBlocks', parseInt(e.target.value)||0)} /></td>
                    <td className="px-3 py-2"><input type="number" className="w-16 bg-transparent outline-none border-b border-transparent focus:border-gray-300 text-right" value={z.comps} onChange={e => upd('comps', parseInt(e.target.value)||0)} /></td>
                    <td className="px-3 py-2 text-right font-semibold text-gray-900">{avail.toLocaleString()}</td>
                    <td className="px-3 py-2"><input type="number" className="w-24 bg-transparent outline-none border-b border-transparent focus:border-gray-300 text-right" value={z.ticketPriceLocal} onChange={e => upd('ticketPriceLocal', parseFloat(e.target.value)||0)} /></td>
                    <td className="px-3 py-2"><input type="number" className="w-24 bg-transparent outline-none border-b border-transparent focus:border-gray-300 text-right" value={z.ticketPriceUsd} onChange={e => upd('ticketPriceUsd', parseFloat(e.target.value)||0)} /></td>
                    <td className="px-3 py-2 text-right font-semibold text-green-600">{fmt(gross)}</td>
                    <td className="px-2 py-2"><button type="button" onClick={() => setTicketZonas(prev => prev.filter((_, xi) => xi !== zi))} className="text-red-300 hover:text-red-500">✕</button></td>
                  </tr>
                )
              })}
            </tbody>
            {ticketZonas.length > 0 && (
              <tfoot>
                <tr className="bg-gray-50 font-semibold text-sm">
                  <td className="px-3 py-2 text-gray-500" colSpan={2}>Totales</td>
                  <td className="px-3 py-2 text-right">{ticketZonas.reduce((s,z) => s+num(z.capacity), 0).toLocaleString()}</td>
                  <td className="px-3 py-2 text-right">{ticketZonas.reduce((s,z) => s+num(z.killsBlocks), 0).toLocaleString()}</td>
                  <td className="px-3 py-2 text-right">{ticketZonas.reduce((s,z) => s+num(z.comps), 0).toLocaleString()}</td>
                  <td className="px-3 py-2 text-right">{ticketZonas.reduce((s,z) => s+Math.max(0,num(z.capacity)-num(z.killsBlocks)-num(z.comps)),0).toLocaleString()}</td>
                  <td colSpan={2} />
                  <td className="px-3 py-2 text-right text-green-600">{fmt(ticketIncome)}</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Patrocinios */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-900">🤝 Sponsorship Income</h2>
          <button type="button" onClick={() => setPatrocinios(prev => [...prev, { nombre: '', montoLocal: 0, montoUsd: 0, notas: '' }])}
            className="text-sm text-blue-500 hover:underline">+ Agregar patrocinio</button>
        </div>
        {patrocinios.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-4">Sin patrocinios registrados</p>
        ) : (
          <div className="space-y-2">
            {patrocinios.map((p, pi) => (
              <div key={pi} className="flex gap-3 items-center">
                <input className="input flex-1" placeholder="Nombre del patrocinio" value={p.nombre}
                  onChange={e => setPatrocinios(prev => prev.map((x,xi) => xi===pi ? {...x, nombre: e.target.value} : x))} />
                <input type="number" className="input w-32" placeholder="Monto Local" value={p.montoLocal}
                  onChange={e => setPatrocinios(prev => prev.map((x,xi) => xi===pi ? {...x, montoLocal: parseFloat(e.target.value)||0} : x))} />
                <input type="number" className="input w-32" placeholder="Monto USD" value={p.montoUsd}
                  onChange={e => setPatrocinios(prev => prev.map((x,xi) => xi===pi ? {...x, montoUsd: parseFloat(e.target.value)||0} : x))} />
                <input className="input flex-1" placeholder="Notas" value={p.notas}
                  onChange={e => setPatrocinios(prev => prev.map((x,xi) => xi===pi ? {...x, notas: e.target.value} : x))} />
                <button type="button" onClick={() => setPatrocinios(prev => prev.filter((_,xi) => xi!==pi))}
                  className="text-red-300 hover:text-red-500">✕</button>
              </div>
            ))}
            <div className="flex justify-end pt-2">
              <span className="text-sm font-semibold text-gray-700">Total patrocinios: {fmt(sponsorIncome)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

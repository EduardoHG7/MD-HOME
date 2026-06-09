'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'

/* ─── Types ─── */
interface Usuario     { id: string; name: string | null; email: string }
interface CotFact     { id: string; descripcion: string; proveedor: string | null; monto: number; archivoNombre: string | null }
interface Cotizacion  { id: string; descripcion: string | null; estado: string; notaAdmin: string | null; montoTotal: number; createdAt: string; facturas: CotFact[]; creadoPor: { name: string | null; email: string } }
interface Linea       { id?: string; descripcion: string; nota: string; montoLocal: number; montoUsd: number; confianza?: string; asignadoAId?: string; asignadoA?: { id: string; name: string | null; email: string } | null; cotizaciones?: Cotizacion[] }
interface Categoria   { id?: string; nombre: string; lineas: Linea[] }
interface TicketZona  { id?: string; scaling: string; zona: string; capacity: number; killsBlocks: number; comps: number; ticketPriceLocal: number; ticketPriceUsd: number }
interface BoletoReal  { id?: string; zona: string; vendidos: number; precio: number; match?: string; nota?: string }
interface Patrocinio  { id?: string; patrocinadorId: string; nombre: string; tipo: string; tipoPago: string; montoLocal: number; montoUsd: number; notas: string; esReal?: boolean }
interface Patrocinador { id: string; nombre: string }
interface Socio       { nombre: string; porcentaje: number }
interface Header      { artista: string; pais: string; ciudad: string; promotor: string; moneda: string; exchangeRate: number; numShows: number }

const emptyHeader: Header = { artista: '', pais: '', ciudad: '', promotor: '', moneda: 'USD', exchangeRate: 1, numShows: 1 }
function fmt(n: number) { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(n) }
function num(v: unknown) { const n = Number(v); return isNaN(n) ? 0 : n }

type Tab = 'presupuesto' | 'reales' | 'comparacion'

/* ─── KPI Card ─── */
function KpiCard({ label, value, sub, color = 'gray' }: { label: string; value: string; sub?: string; color?: string }) {
  const colors: Record<string, string> = { gray: 'border-l-gray-400', green: 'border-l-green-400', red: 'border-l-red-400', amber: 'border-l-amber-400', blue: 'border-l-blue-400', purple: 'border-l-purple-400' }
  return (
    <div className={`card p-4 border-l-4 ${colors[color] ?? colors.gray}`}>
      <p className="text-gray-500 text-xs mb-1">{label}</p>
      <p className="text-xl font-bold text-gray-900">{value}</p>
      {sub && <p className="text-gray-400 text-xs mt-0.5">{sub}</p>}
    </div>
  )
}

/* ─── Categoría Acordeón (con cotizaciones y asignación) ─── */
function CategoriaRow({ cat, idx, rate, usuarios, onChange, onDelete, isAdmin }: {
  cat: Categoria; idx: number; rate: number; usuarios: Usuario[]
  onChange: (c: Categoria) => void; onDelete: () => void; isAdmin: boolean
}) {
  const [open, setOpen] = useState(false)
  const [cotOpen, setCotOpen] = useState<string | null>(null)
  const totalUsd = cat.lineas.reduce((s, l) => s + num(l.montoUsd), 0)

  function updateLinea(li: number, field: keyof Linea, val: string | number | undefined) {
    const lineas = cat.lineas.map((l, i) => {
      if (i !== li) return l
      const updated = { ...l, [field]: val }
      if (field === 'montoLocal') updated.montoUsd = rate ? num(val) / rate : 0
      if (field === 'montoUsd')   updated.montoLocal = rate ? num(val) * rate : 0
      return updated
    })
    onChange({ ...cat, lineas })
  }

  return (
    <div className="card overflow-hidden">
      <button type="button" onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors">
        <div className="flex items-center gap-3">
          <span className="text-gray-400 text-sm">{open ? '▼' : '▶'}</span>
          <input className="font-semibold text-gray-900 bg-transparent border-none outline-none text-sm w-48"
            value={cat.nombre} onClick={e => e.stopPropagation()}
            onChange={e => onChange({ ...cat, nombre: e.target.value })} />
          <span className="text-xs text-gray-400">{cat.lineas.length} subcategoría(s)</span>
        </div>
        <div className="flex items-center gap-6 text-sm">
          <span className="text-gray-500 font-semibold">{fmt(totalUsd)}</span>
          <button type="button" onClick={e => { e.stopPropagation(); onDelete() }}
            className="text-red-300 hover:text-red-500 text-xs px-2 py-1 rounded hover:bg-red-50">✕</button>
        </div>
      </button>

      {open && (
        <div className="border-t border-gray-100">
          {cat.lineas.map((l, li) => {
            const cotAprobadas = (l.cotizaciones ?? []).filter(c => c.estado === 'APROBADA')
            const totalCot = cotAprobadas.reduce((s, c) => s + c.montoTotal, 0)
            const diff = num(l.montoUsd) - totalCot
            return (
              <div key={li} className={`border-b border-gray-50 ${l.confianza === 'LOW' ? 'bg-amber-50' : ''}`}>
                {/* Fila de subcategoría */}
                <div className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <div className="flex-1 min-w-0">
                    <input className="w-full bg-transparent outline-none border-b border-transparent focus:border-gray-300 text-gray-900 font-medium"
                      value={l.descripcion} onChange={e => updateLinea(li, 'descripcion', e.target.value)} placeholder="Subcategoría..." />
                    {l.confianza === 'LOW' && <span className="text-amber-500 text-xs">⚠ Revisar</span>}
                  </div>
                  <input className="w-32 bg-transparent outline-none border-b border-transparent focus:border-gray-300 text-xs text-gray-400"
                    value={l.nota} onChange={e => updateLinea(li, 'nota', e.target.value)} placeholder="Nota..." />
                  <input type="number" className="w-24 bg-transparent outline-none border-b border-transparent focus:border-gray-300 text-right text-gray-500 text-sm"
                    value={l.montoLocal} onChange={e => updateLinea(li, 'montoLocal', parseFloat(e.target.value)||0)} />
                  <input type="number" className="w-24 bg-transparent outline-none border-b border-transparent focus:border-gray-300 text-right font-medium text-sm"
                    value={l.montoUsd} onChange={e => updateLinea(li, 'montoUsd', parseFloat(e.target.value)||0)} />
                  {/* Asignar usuario */}
                  {isAdmin && (
                    <select className="text-xs border border-gray-200 rounded-lg px-2 py-1 text-gray-600 w-36"
                      value={l.asignadoAId ?? ''}
                      onChange={e => updateLinea(li, 'asignadoAId', e.target.value || undefined)}>
                      <option value="">Sin asignar</option>
                      {usuarios.map(u => <option key={u.id} value={u.id}>{u.name ?? u.email}</option>)}
                    </select>
                  )}
                  {/* Real vs presupuesto */}
                  {(l.cotizaciones?.length ?? 0) > 0 && (
                    <button type="button" onClick={() => setCotOpen(cotOpen === `${li}` ? null : `${li}`)}
                      className={`text-xs px-2 py-1 rounded-lg border font-medium transition-all ${diff < 0 ? 'border-red-200 text-red-600 bg-red-50' : 'border-green-200 text-green-600 bg-green-50'}`}>
                      {l.cotizaciones!.length} cot. · {diff >= 0 ? '+' : ''}{fmt(diff)}
                    </button>
                  )}
                  <button type="button" onClick={() => onChange({ ...cat, lineas: cat.lineas.filter((_, i) => i !== li) })}
                    className="text-red-300 hover:text-red-500">✕</button>
                </div>

                {/* Cotizaciones de esta subcategoría */}
                {cotOpen === `${li}` && (l.cotizaciones?.length ?? 0) > 0 && (
                  <div className="mx-4 mb-3 bg-gray-50 rounded-xl overflow-hidden border border-gray-200">
                    <div className="px-3 py-2 bg-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Cotizaciones — Presupuesto: {fmt(num(l.montoUsd))} · Real aprobado: {fmt(totalCot)}
                    </div>
                    {l.cotizaciones!.map(cot => (
                      <CotizacionRow key={cot.id} cot={cot} isAdmin={isAdmin} onUpdate={() => {}} />
                    ))}
                  </div>
                )}
              </div>
            )
          })}

          {/* Footer categoría */}
          <div className="flex items-center justify-between px-4 py-2 bg-gray-50 text-sm">
            <button type="button" onClick={() => onChange({ ...cat, lineas: [...cat.lineas, { descripcion: '', nota: '', montoLocal: 0, montoUsd: 0 }] })}
              className="text-xs text-blue-500 hover:underline">+ Agregar subcategoría</button>
            <div className="flex gap-8 font-semibold">
              <span className="text-gray-500">{cat.lineas.reduce((s,l) => s+num(l.montoLocal),0).toLocaleString()}</span>
              <span className="text-gray-900">{fmt(totalUsd)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ─── Fila de cotización ─── */
function CotizacionRow({ cot, isAdmin, onUpdate }: { cot: Cotizacion; isAdmin: boolean; onUpdate: (updated: Cotizacion) => void }) {
  const [saving, setSaving] = useState(false)
  const [nota, setNota] = useState(cot.notaAdmin ?? '')
  const COLORS: Record<string, string> = { PENDIENTE: 'bg-yellow-100 text-yellow-700', APROBADA: 'bg-green-100 text-green-700', RECHAZADA: 'bg-red-100 text-red-600' }

  async function decide(estado: string) {
    setSaving(true)
    const res = await fetch(`/api/cotizaciones/${cot.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado, notaAdmin: nota }),
    })
    if (res.ok) { const updated = await res.json(); onUpdate(updated) }
    setSaving(false)
  }

  return (
    <div className="px-3 py-2.5 border-b border-gray-100 last:border-0">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${COLORS[cot.estado] ?? ''}`}>{cot.estado}</span>
            <p className="text-xs text-gray-500">{cot.creadoPor.name ?? cot.creadoPor.email} · {new Date(cot.createdAt).toLocaleDateString('es-PA')}</p>
          </div>
          {cot.descripcion && <p className="text-xs text-gray-600 mt-0.5">{cot.descripcion}</p>}
          <div className="flex flex-wrap gap-2 mt-1">
            {cot.facturas.map(f => (
              <span key={f.id} className="text-xs bg-white border border-gray-200 rounded-lg px-2 py-0.5 text-gray-600">
                {f.descripcion} — {fmt(f.monto)}
              </span>
            ))}
          </div>
          {cot.notaAdmin && <p className="text-xs text-gray-400 italic mt-1">"{cot.notaAdmin}"</p>}
        </div>
        <div className="text-right shrink-0">
          <p className="font-bold text-gray-900">{fmt(cot.montoTotal)}</p>
          {isAdmin && cot.estado === 'PENDIENTE' && (
            <div className="flex flex-col gap-1 mt-2">
              <input className="text-xs border rounded px-1 py-0.5 w-28" placeholder="Nota..." value={nota} onChange={e => setNota(e.target.value)} />
              <div className="flex gap-1">
                <button onClick={() => decide('RECHAZADA')} disabled={saving} className="flex-1 text-xs px-2 py-1 rounded border border-red-200 text-red-500 hover:bg-red-50">✕</button>
                <button onClick={() => decide('APROBADA')}  disabled={saving} className="flex-1 text-xs px-2 py-1 rounded bg-green-600 text-white hover:bg-green-700">✓</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ─── Página principal ─── */
export default function PresupuestoPage() {
  const { id: eventoId } = useParams<{ id: string }>()
  const router = useRouter()

  const [tab,         setTab]         = useState<Tab>('presupuesto')
  const [header,      setHeader]      = useState<Header>(emptyHeader)
  const [artistG,     setArtistG]     = useState(0)
  const [categorias,  setCategorias]  = useState<Categoria[]>([])
  const [ticketZonas, setTicketZonas] = useState<TicketZona[]>([])
  const [patrocinios, setPatrocinios] = useState<Patrocinio[]>([])
  const [boletosReal, setBoletosReal] = useState<BoletoReal[]>([])
  const [patroReal,   setPatroReal]   = useState<Patrocinio[]>([])
  const [patrocinadores, setPatrocinadores] = useState<Patrocinador[]>([])
  const [usuarios,    setUsuarios]    = useState<Usuario[]>([])
  const [artistBackend,    setArtistBackend]    = useState(false)
  const [artistBackendPct, setArtistBackendPct] = useState(80)
  const [socios,           setSocios]           = useState<Socio[]>([])
  const [loading,     setLoading]     = useState(true)
  const [dataLoaded,  setDataLoaded]  = useState(false)
  const [tipoEvento,  setTipoEvento]  = useState<string | null>(null)
  const [saving,          setSaving]          = useState(false)
  const [extracting,      setExtracting]      = useState(false)
  const [extractError,    setExtractError]    = useState('')
  const [extractingBol,   setExtractingBol]   = useState(false)
  const [extractBolError, setExtractBolError] = useState('')
  const fileRef    = useRef<HTMLInputElement>(null)
  const boletoRef  = useRef<HTMLInputElement>(null)

  const isAdmin = true // página solo accesible para admins
  const isContratado = ['CONTRATADO', 'LICITACION'].includes(tipoEvento ?? '')

  const loadPresupuesto = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/presupuestos/${eventoId}`)
    if (res.ok) {
      const data = await res.json()
      setDataLoaded(true) // marcar siempre que el GET fue exitoso
      if (data) {
        setHeader({ artista: data.artista ?? '', pais: data.pais ?? '', ciudad: data.ciudad ?? '', promotor: data.promotor ?? '', moneda: data.moneda ?? 'USD', exchangeRate: data.exchangeRate ?? 1, numShows: data.numShows ?? 1 })
        setArtistG(data.artistGuarantee ?? 0)
        setCategorias(data.categorias?.map((c: Categoria) => ({ ...c, lineas: (c.lineas ?? []).map((l: Linea) => ({ ...l, nota: l.nota ?? '', asignadoAId: l.asignadoAId ?? '' })) })) ?? [])
        setTicketZonas(data.ticketZonas ?? [])
        const pats = data.patrocinios ?? []
        setPatrocinios(pats.filter((p: Patrocinio) => !p.esReal).map((p: Patrocinio) => ({ ...p, notas: p.notas ?? '', tipo: p.tipo ?? '', tipoPago: p.tipoPago ?? '', patrocinadorId: p.patrocinadorId ?? '' })))
        setPatroReal(pats.filter((p: Patrocinio) => p.esReal).map((p: Patrocinio) => ({ ...p, notas: p.notas ?? '', tipo: p.tipo ?? '', tipoPago: p.tipoPago ?? '', patrocinadorId: p.patrocinadorId ?? '' })))
        setBoletosReal(data.boletosVendidosReal ?? [])
        setArtistBackend(data.artistBackend ?? false)
        setArtistBackendPct(data.artistBackendPct ?? 80)
        setSocios(data.socios?.map((s: Socio) => ({ nombre: s.nombre, porcentaje: s.porcentaje })) ?? [])
      }
    }
    setLoading(false)
  }, [eventoId])

  useEffect(() => {
    loadPresupuesto()
    fetch(`/api/eventos/${eventoId}`).then(r => r.json()).then(d => { if (d?.tipoEvento) setTipoEvento(d.tipoEvento) })
    fetch('/api/patrocinadores').then(r => r.json()).then(d => setPatrocinadores(Array.isArray(d) ? d : []))
    fetch('/api/usuarios/lista').then(r => r.json()).then(d => setUsuarios(Array.isArray(d) ? d : []))
  }, [loadPresupuesto, eventoId])

  async function handleSave() {
    if (!dataLoaded) {
      alert('Espera a que los datos carguen antes de guardar.')
      return
    }
    if (categorias.length === 0) {
      const ok = window.confirm('No hay categorías de costos. ¿Seguro que quieres guardar sin categorías? Esto borrará los datos existentes.')
      if (!ok) return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/presupuestos/${eventoId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...header, artistGuarantee: artistG, artistBackend, artistBackendPct, categorias, ticketZonas, patrocinios, socios, boletosVendidosReal: boletosReal, patrociniosReales: patroReal }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        alert(`Error al guardar: ${err.error ?? res.status}`)
      } else {
        await loadPresupuesto() // recargar desde BD para confirmar que guardó
      }
    } catch (e) {
      alert(`Error de conexión al guardar: ${e}`)
    } finally {
      setSaving(false)
    }
  }

  async function handleFileUpload(file: File) {
    setExtracting(true); setExtractError('')
    try {
      const base64 = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res((r.result as string).split(',')[1]); r.onerror = rej; r.readAsDataURL(file) })
      const resp = await fetch('/api/presupuestos/extract', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ base64, mimeType: file.type, fileName: file.name }) })
      const data = await resp.json()
      if (!resp.ok) { setExtractError(data.error ?? 'Error al procesar'); return }
      if (data.header) setHeader({ artista: data.header.artista ?? '', pais: data.header.pais ?? '', ciudad: data.header.ciudad ?? '', promotor: data.header.promotor ?? '', moneda: data.header.moneda ?? 'USD', exchangeRate: data.header.exchangeRate ?? 1, numShows: data.header.numShows ?? 1 })
      if (data.artistGuarantee) setArtistG(data.artistGuarantee)
      if (data.categorias?.length) setCategorias(data.categorias.map((c: Categoria) => ({ ...c, lineas: c.lineas ?? [] })))
      if (data.ticketZonas?.length) setTicketZonas(data.ticketZonas.map((z: TicketZona) => ({ ...z, scaling: z.scaling ?? '' })))
    } catch (e) { setExtractError(String(e)) }
    finally { setExtracting(false) }
  }

  /* ─── Cálculos presupuesto ─── */
  const isVarExp       = (c: Categoria) => c.nombre.toUpperCase().includes('VARIABLE')
  const totalProd      = categorias.filter(c => !isVarExp(c)).reduce((s, c) => s + c.lineas.reduce((ss, l) => ss + num(l.montoUsd), 0), 0)
  const totalVar       = categorias.filter(c =>  isVarExp(c)).reduce((s, c) => s + c.lineas.reduce((ss, l) => ss + num(l.montoUsd), 0), 0)
  const presupTotal    = artistG + totalProd + totalVar
  const ticketIncome   = ticketZonas.reduce((s, z) => s + Math.max(0, num(z.capacity)-num(z.killsBlocks)-num(z.comps)) * num(z.ticketPriceUsd), 0)
  const sponsorIncome  = patrocinios.reduce((s, p) => s + num(p.montoUsd), 0)
  const totalIncome    = ticketIncome + sponsorIncome
  const profitLoss     = totalIncome - presupTotal

  /* ─── Cálculos contratado ─── */
  const costoProveedores  = categorias.reduce((s, c) => s + c.lineas.reduce((ss, l) => ss + num(l.montoLocal), 0), 0)
  const precioCliente     = totalProd + totalVar + artistG
  const margenBruto       = precioCliente - costoProveedores

  /* ─── Cálculos reales ─── */
  const costoRealCot    = categorias.reduce((s, c) => s + c.lineas.reduce((ss, l) => ss + (l.cotizaciones ?? []).filter(x => x.estado === 'APROBADA').reduce((sss, x) => sss + x.montoTotal, 0), 0), 0)
  const ticketRealIncome = boletosReal.reduce((s, b) => s + num(b.vendidos) * num(b.precio), 0)
  const patroRealIncome  = patroReal.reduce((s, p) => s + num(p.montoUsd), 0)
  const totalRealIncome  = ticketRealIncome + patroRealIncome
  const profitRealLoss   = totalRealIncome - costoRealCot

  async function handleBoletosUpload(file: File) {
    setExtractingBol(true); setExtractBolError('')
    try {
      const base64 = await new Promise<string>((res, rej) => {
        const r = new FileReader(); r.onload = () => res((r.result as string).split(',')[1]); r.onerror = rej; r.readAsDataURL(file)
      })
      const resp = await fetch('/api/presupuestos/extract-boletos', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          base64, mimeType: file.type,
          zonasPresupuesto: ticketZonas.map(z => ({ zona: z.zona, ticketPriceUsd: z.ticketPriceUsd })),
        }),
      })
      const data = await resp.json()
      if (!resp.ok) { setExtractBolError(data.error ?? 'Error al procesar'); return }
      if (data.zonas?.length) {
        setBoletosReal(
          data.zonas
            .filter((z: { precio: number }) => num(z.precio) > 0)
            .map((z: { zona: string; vendidos: number; precio: number; match?: string; nota?: string }) => ({
              zona: z.zona, vendidos: z.vendidos, precio: z.precio, match: z.match, nota: z.nota ?? undefined,
            }))
        )
      }
    } catch (e) { setExtractBolError(String(e)) }
    finally { setExtractingBol(false) }
  }

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-400 animate-pulse">Cargando presupuesto...</div>

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="text-gray-400 hover:text-gray-700 text-sm">← Volver</button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Dashboard Financiero</h1>
            <p className="text-gray-500 text-sm">Presupuesto · Costos Reales · Comparación</p>
          </div>
        </div>
        <div className="flex gap-2">
          <label className={`btn-ghost text-sm cursor-pointer ${extracting ? 'opacity-50' : ''}`}>
            {extracting ? '⏳ Procesando...' : '📄 Importar PDF / Imagen / Excel'}
            <input ref={fileRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.xlsx,.xls" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(f) }} />
          </label>
          <button onClick={handleSave} disabled={saving} className="btn-primary text-sm">
            {saving ? 'Guardando...' : '💾 Guardar'}
          </button>
        </div>
      </div>

      {extractError && <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl px-4 py-3 text-sm">{extractError}</div>}

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-2xl p-1 w-fit">
        {([['presupuesto','📊 Presupuesto'],['reales','💰 Costos Reales'],['comparacion','⚖️ Budget vs Real']] as [Tab,string][]).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-5 py-2 rounded-xl text-sm font-medium transition-all ${tab === t ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* ════ TAB: PRESUPUESTO ════ */}
      {tab === 'presupuesto' && (
        <div className="space-y-6">
          {/* KPIs */}
          {isContratado ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <KpiCard label="Fee de Coordinación"   value={fmt(artistG)}          color="purple" />
              <KpiCard label="Costos (Proveedores)"  value={fmt(costoProveedores)} color="amber" />
              <KpiCard label="Precio al Cliente"     value={fmt(precioCliente)}    color="blue" />
              <KpiCard label="Margen Bruto"          value={fmt(margenBruto)} color={margenBruto >= 0 ? 'green' : 'red'} sub={margenBruto >= 0 ? '✅ Rentable' : '⚠️ Pérdida'} />
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <KpiCard label="Artist Guarantee"         value={fmt(artistG)}       color="purple" />
              <KpiCard label="Production Expenses"      value={fmt(totalProd)}     color="amber" />
              <KpiCard label="Variable Expenses"        value={fmt(totalVar)}      color="amber" sub="Resta a la ganancia, no al costo" />
              <KpiCard label="Costo Fijo Total"         value={fmt(artistG + totalProd)} color="amber" />
              <KpiCard label="Ingreso Boletos (est.)"   value={fmt(ticketIncome)}  color="blue" />
              <KpiCard label="Ingreso Patrocinios"      value={fmt(sponsorIncome)} color="blue" />
              <KpiCard label="Ingreso Total Estimado"   value={fmt(totalIncome)}   color="green" />
              <KpiCard label="Utilidad / Pérdida"       value={fmt(profitLoss)} color={profitLoss >= 0 ? 'green' : 'red'} sub={profitLoss >= 0 ? '✅ Rentable' : '⚠️ Pérdida'} />
            </div>
          )}

          {/* Info evento */}
          <div className="card p-5">
            <h2 className="font-semibold text-gray-900 mb-4">Información del Evento</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              {(isContratado
                ? [['Cliente','artista'],['Locación','ciudad'],['Fecha','promotor'],['Moneda','moneda']] as [string, keyof Header][]
                : [['Artista','artista'],['País','pais'],['Ciudad','ciudad'],['Promotor','promotor'],['Moneda','moneda'],['Exchange rate','exchangeRate'],['N° shows','numShows']] as [string, keyof Header][]
              ).map(([label, key]) => (
                <div key={key}>
                  <label className="label">{label}</label>
                  <input className="input" value={String(header[key] ?? '')} type={typeof header[key] === 'number' ? 'number' : 'text'}
                    onChange={e => setHeader(h => ({ ...h, [key]: typeof h[key] === 'number' ? parseFloat(e.target.value)||0 : e.target.value }))} />
                </div>
              ))}
            </div>
          </div>

          {/* Artist Guarantee / Fee */}
          <div className="card p-5 border-l-4 border-l-purple-400">
            <h2 className="font-semibold text-gray-900 mb-3">{isContratado ? '🏷️ Fee de Coordinación / Producción' : '🎤 Artist Guarantee'}</h2>
            <div className="flex items-center gap-4">
              <div className="flex-1"><label className="label">{isContratado ? 'Fee (B/.)' : 'Monto (USD)'}</label>
                <input type="number" className="input" value={artistG} onChange={e => setArtistG(parseFloat(e.target.value)||0)} /></div>
              <div className="text-right"><p className="text-gray-400 text-xs">Total</p><p className="text-2xl font-bold text-purple-600">{fmt(artistG)}</p></div>
            </div>
          </div>

          {/* Categorías */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">📊 Categorías de Costos</h2>
              <button type="button" onClick={() => setCategorias(prev => [...prev, { nombre: 'NUEVA CATEGORÍA', lineas: [] }])} className="text-sm text-blue-500 hover:underline">+ Agregar categoría</button>
            </div>
            {/* Header tabla */}
            <div className="hidden md:grid grid-cols-12 gap-2 px-4 text-xs text-gray-400 font-medium uppercase tracking-wide">
              <span className="col-span-3">Subcategoría</span><span className="col-span-2">Nota</span>
              <span className="col-span-2 text-right">{isContratado ? 'Costo Proveedor' : 'Local'}</span>
              <span className="col-span-2 text-right">{isContratado ? 'Precio Cliente' : 'USD'}</span>
              <span className="col-span-2">Asignado a</span><span className="col-span-1" />
            </div>
            {categorias.length === 0 && <div className="card p-8 text-center text-gray-400 text-sm"><p className="text-3xl mb-2">📋</p>Importa un archivo o agrega categorías manualmente</div>}
            {categorias.map((cat, i) => (
              <CategoriaRow key={i} cat={cat} idx={i} rate={header.exchangeRate} usuarios={usuarios} isAdmin={isAdmin}
                onChange={c => setCategorias(prev => prev.map((x, xi) => xi === i ? c : x))}
                onDelete={() => setCategorias(prev => prev.filter((_, xi) => xi !== i))} />
            ))}
            {categorias.length > 0 && (
              <div className="flex justify-end gap-6 px-5 py-3 bg-gray-50 rounded-xl border border-gray-200 text-sm">
                {totalVar > 0 && (
                  <div className="flex items-center gap-2 text-amber-600">
                    <span className="font-medium">Gastos variables</span>
                    <span className="font-bold">{fmt(totalVar)}</span>
                    <span className="text-xs text-amber-400">(resta ganancia, no suma al costo fijo)</span>
                  </div>
                )}
                <div className="flex items-center gap-2 font-semibold">
                  <span className="text-gray-500">Total Costos Fijos</span>
                  <span className="text-gray-900">{fmt(totalProd)}</span>
                </div>
              </div>
            )}
          </div>

          {/* Ticket Scaling — solo eventos propios */}
          {!isContratado && <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900">🎟️ Ticket Scaling (Presupuesto)</h2>
              <button type="button" onClick={() => setTicketZonas(prev => [...prev, { scaling:'', zona:'', capacity:0, killsBlocks:0, comps:0, ticketPriceLocal:0, ticketPriceUsd:0 }])} className="text-sm text-blue-500 hover:underline">+ Zona</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="bg-gray-50 text-gray-400 text-xs">
                  <th className="px-3 py-2 text-left">Scaling</th><th className="px-3 py-2 text-left">Zona</th>
                  <th className="px-3 py-2 text-right">Cap.</th><th className="px-3 py-2 text-right">Kills</th>
                  <th className="px-3 py-2 text-right">Comps</th><th className="px-3 py-2 text-right">Avail.</th>
                  <th className="px-3 py-2 text-right">Price USD</th><th className="px-3 py-2 text-right">Gross USD</th><th className="px-2 py-2"/>
                </tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {ticketZonas.map((z, zi) => {
                    const avail = Math.max(0, num(z.capacity)-num(z.killsBlocks)-num(z.comps))
                    const gross = avail * num(z.ticketPriceUsd)
                    function upd(field: keyof TicketZona, val: string|number) { setTicketZonas(prev => prev.map((x,xi) => xi===zi ? {...x,[field]:val} : x)) }
                    return (
                      <tr key={zi} className="hover:bg-gray-50">
                        <td className="px-3 py-2"><input className="w-14 bg-transparent outline-none border-b border-transparent focus:border-gray-300 text-xs" value={z.scaling} onChange={e => upd('scaling',e.target.value)} /></td>
                        <td className="px-3 py-2"><input className="w-24 bg-transparent outline-none border-b border-transparent focus:border-gray-300 font-medium text-sm" value={z.zona} onChange={e => upd('zona',e.target.value)} /></td>
                        <td className="px-3 py-2"><input type="number" className="w-16 bg-transparent outline-none border-b border-transparent focus:border-gray-300 text-right text-sm" value={z.capacity} onChange={e => upd('capacity',parseInt(e.target.value)||0)} /></td>
                        <td className="px-3 py-2"><input type="number" className="w-16 bg-transparent outline-none border-b border-transparent focus:border-gray-300 text-right text-sm" value={z.killsBlocks} onChange={e => upd('killsBlocks',parseInt(e.target.value)||0)} /></td>
                        <td className="px-3 py-2"><input type="number" className="w-14 bg-transparent outline-none border-b border-transparent focus:border-gray-300 text-right text-sm" value={z.comps} onChange={e => upd('comps',parseInt(e.target.value)||0)} /></td>
                        <td className="px-3 py-2 text-right font-semibold text-gray-900 text-sm">{avail.toLocaleString()}</td>
                        <td className="px-3 py-2"><input type="number" className="w-20 bg-transparent outline-none border-b border-transparent focus:border-gray-300 text-right text-sm" value={z.ticketPriceUsd} onChange={e => upd('ticketPriceUsd',parseFloat(e.target.value)||0)} /></td>
                        <td className="px-3 py-2 text-right font-semibold text-green-600 text-sm">{fmt(gross)}</td>
                        <td className="px-2 py-2"><button type="button" onClick={() => setTicketZonas(prev => prev.filter((_,xi) => xi!==zi))} className="text-red-300 hover:text-red-500 text-sm">✕</button></td>
                      </tr>
                    )
                  })}
                </tbody>
                {ticketZonas.length > 0 && <tfoot><tr className="bg-gray-50 font-semibold text-sm">
                  <td className="px-3 py-2 text-gray-500" colSpan={7}>Total boletos estimados</td>
                  <td className="px-3 py-2 text-right text-green-600">{fmt(ticketIncome)}</td><td />
                </tr></tfoot>}
              </table>
            </div>
          </div>

          }

          {/* Patrocinios presupuestados — solo eventos propios */}
          {!isContratado && <PatrociniosSection title="🤝 Sponsorship Income (Presupuesto)" patrocinios={patrocinios} patrocinadores={patrocinadores} onChange={setPatrocinios} />}

          {/* ── Distribución de Ganancias ── */}
          {!isContratado && (() => {
            const netAnteArtista  = totalIncome - totalProd - totalVar
            const backendAmount   = (artistBackendPct / 100) * netAnteArtista
            const backendAplica   = artistBackend && backendAmount > artistG
            const artistPayout    = backendAplica ? backendAmount : artistG
            const pool            = netAnteArtista - artistPayout
            const totalPct        = socios.reduce((s, x) => s + x.porcentaje, 0)
            return (
              <div className="card p-5 border-l-4 border-l-indigo-400 space-y-5">
                <h2 className="font-semibold text-gray-900">💼 Distribución de Ganancias</h2>

                {/* Toggle 80/20 */}
                <div className="flex items-center justify-between bg-indigo-50 rounded-xl px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-indigo-900">Backend / Regla {artistBackendPct}% artista</p>
                    <p className="text-xs text-indigo-500 mt-0.5">Si el {artistBackendPct}% de la ganancia neta supera la garantía, el artista recibe ese porcentaje</p>
                  </div>
                  <button type="button" onClick={() => setArtistBackend(v => !v)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${artistBackend ? 'bg-indigo-600' : 'bg-gray-300'}`}>
                    <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${artistBackend ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>

                {/* Porcentaje ajustable */}
                {artistBackend && (
                  <div className="flex items-center gap-3">
                    <label className="text-sm text-gray-600 whitespace-nowrap">Porcentaje al artista:</label>
                    <input type="number" min={1} max={99} step={1} className="input w-24 text-center font-bold"
                      value={artistBackendPct} onChange={e => setArtistBackendPct(Math.min(99, Math.max(1, parseInt(e.target.value)||80)))} />
                    <span className="text-gray-500 text-sm">%</span>
                  </div>
                )}

                {/* Cálculo */}
                <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Ingresos estimados</span>
                    <span className="font-semibold">{fmt(totalIncome)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Costos de producción</span>
                    <span className="font-semibold text-red-500">− {fmt(totalProd + totalVar)}</span>
                  </div>
                  <div className="flex justify-between border-t border-gray-200 pt-2 font-semibold">
                    <span className="text-gray-700">Ganancia neta (antes del artista)</span>
                    <span className={netAnteArtista >= 0 ? 'text-green-600' : 'text-red-600'}>{fmt(netAnteArtista)}</span>
                  </div>
                  {artistBackend && (
                    <div className="flex justify-between text-xs text-indigo-600">
                      <span>{artistBackendPct}% de la ganancia neta</span>
                      <span className="font-semibold">{fmt(backendAmount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between border-t border-gray-200 pt-2">
                    <span className="text-gray-500">
                      Pago al artista
                      {artistBackend && <span className={`ml-2 text-xs px-2 py-0.5 rounded-full font-medium ${backendAplica ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-200 text-gray-500'}`}>
                        {backendAplica ? `Backend ${artistBackendPct}% aplica` : 'Garantía aplica'}
                      </span>}
                    </span>
                    <span className="font-bold text-purple-600">− {fmt(artistPayout)}</span>
                  </div>
                  <div className="flex justify-between border-t-2 border-gray-300 pt-2 font-bold text-base">
                    <span className="text-gray-900">Pool para promotores</span>
                    <span className={pool >= 0 ? 'text-green-600' : 'text-red-600'}>{fmt(pool)}</span>
                  </div>
                </div>

                {/* Socios */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-semibold text-gray-700">Socios / Promotores</p>
                    <button type="button" onClick={() => setSocios(prev => [...prev, { nombre: '', porcentaje: 0 }])}
                      className="text-sm text-blue-500 hover:underline">+ Agregar socio</button>
                  </div>
                  {socios.length === 0 && <p className="text-gray-400 text-xs text-center py-3">Sin socios definidos</p>}
                  <div className="space-y-2">
                    {socios.map((s, si) => (
                      <div key={si} className="flex items-center gap-3 bg-gray-50 rounded-xl px-3 py-2">
                        <input className="flex-1 bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-gray-400"
                          placeholder="Nombre del socio..." value={s.nombre}
                          onChange={e => setSocios(prev => prev.map((x, i) => i === si ? { ...x, nombre: e.target.value } : x))} />
                        <input type="number" min={0} max={100} step={0.1}
                          className="w-20 bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-center outline-none focus:border-gray-400"
                          placeholder="%" value={s.porcentaje}
                          onChange={e => setSocios(prev => prev.map((x, i) => i === si ? { ...x, porcentaje: parseFloat(e.target.value)||0 } : x))} />
                        <span className="text-gray-400 text-sm">%</span>
                        <span className={`text-sm font-semibold w-24 text-right ${pool >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                          {fmt((s.porcentaje / 100) * pool)}
                        </span>
                        <button type="button" onClick={() => setSocios(prev => prev.filter((_, i) => i !== si))}
                          className="text-red-300 hover:text-red-500 text-sm">✕</button>
                      </div>
                    ))}
                  </div>
                  {socios.length > 0 && (
                    <div className={`flex justify-between items-center mt-3 px-3 py-2 rounded-xl text-sm font-semibold ${Math.abs(totalPct - 100) < 0.1 ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
                      <span>Total asignado: {totalPct.toFixed(1)}% {Math.abs(totalPct - 100) < 0.1 ? '✓' : `(faltan ${(100 - totalPct).toFixed(1)}%)`}</span>
                      <span>{fmt(socios.reduce((s, x) => s + (x.porcentaje / 100) * pool, 0))}</span>
                    </div>
                  )}
                </div>
              </div>
            )
          })()}
        </div>
      )}

      {/* ════ TAB: COSTOS REALES ════ */}
      {tab === 'reales' && (
        <div className="space-y-6">
          {isContratado ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <KpiCard label="Costos aprobados"       value={fmt(costoRealCot)}                  color="amber" />
              <KpiCard label="Precio al Cliente"      value={fmt(precioCliente)}                 color="blue" />
              <KpiCard label="Margen Real"            value={fmt(precioCliente - costoRealCot)} color={precioCliente - costoRealCot >= 0 ? 'green' : 'red'} sub={precioCliente - costoRealCot >= 0 ? '✅ Ganancia' : '⚠️ Pérdida'} />
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <KpiCard label="Costos aprobados"     value={fmt(costoRealCot)}    color="amber" />
              <KpiCard label="Boletos vendidos $"    value={fmt(ticketRealIncome)} color="blue" />
              <KpiCard label="Patrocinios reales $"  value={fmt(patroRealIncome)}  color="blue" />
              <KpiCard label="Utilidad / Pérdida Real" value={fmt(profitRealLoss)} color={profitRealLoss >= 0 ? 'green' : 'red'} sub={profitRealLoss >= 0 ? '✅ Ganancia' : '⚠️ Pérdida'} />
            </div>
          )}

          {/* Cotizaciones por categoría — todas las pendientes y aprobadas */}
          <div className="space-y-4">
            <h2 className="font-semibold text-gray-900">📋 Cotizaciones por Subcategoría</h2>
            {categorias.map(cat => {
              const lineasConCot = cat.lineas.filter(l => (l.cotizaciones ?? []).length > 0)
              if (!lineasConCot.length) return null
              const catAprobado = lineasConCot.reduce((s, l) => s + (l.cotizaciones ?? []).filter(c => c.estado === 'APROBADA').reduce((ss, c) => ss + c.montoTotal, 0), 0)
              const catPresup   = lineasConCot.reduce((s, l) => s + num(l.montoUsd), 0)
              return (
                <div key={cat.nombre} className="card overflow-hidden">
                  {/* Header categoría */}
                  <div className="flex items-center justify-between px-5 py-3 bg-gray-50 border-b border-gray-100">
                    <p className="text-sm font-semibold text-gray-700 uppercase tracking-wide">{cat.nombre}</p>
                    <div className="flex items-center gap-4 text-xs">
                      <span className="text-gray-400">Presup: <span className="font-semibold text-gray-600">{fmt(catPresup)}</span></span>
                      <span className="text-gray-400">Aprobado: <span className={`font-semibold ${catAprobado > catPresup ? 'text-red-600' : 'text-green-600'}`}>{fmt(catAprobado)}</span></span>
                    </div>
                  </div>
                  {/* Líneas con cotizaciones */}
                  {lineasConCot.map(l => {
                    const cots     = l.cotizaciones ?? []
                    const aprobadas = cots.filter(c => c.estado === 'APROBADA')
                    const pendientes = cots.filter(c => c.estado === 'PENDIENTE')
                    const totalAprob = aprobadas.reduce((s, c) => s + c.montoTotal, 0)
                    return (
                      <div key={l.descripcion} className="border-b border-gray-50 last:border-0">
                        {/* Resumen línea */}
                        <div className="flex items-center justify-between px-5 py-3 bg-white">
                          <div>
                            <p className="text-sm font-medium text-gray-900">{l.descripcion}</p>
                            <div className="flex gap-3 mt-0.5">
                              {pendientes.length > 0 && <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full font-medium">{pendientes.length} pendiente(s)</span>}
                              {aprobadas.length > 0  && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">{aprobadas.length} aprobada(s)</span>}
                            </div>
                          </div>
                          <div className="text-right text-sm">
                            <p className="font-bold text-gray-900">{fmt(totalAprob)} <span className="text-gray-400 font-normal text-xs">aprobado</span></p>
                            <p className={`text-xs ${num(l.montoUsd) >= totalAprob ? 'text-green-500' : 'text-red-500'}`}>
                              Presup: {fmt(num(l.montoUsd))} {num(l.montoUsd) >= totalAprob ? '✓' : '⚠ excede'}
                            </p>
                          </div>
                        </div>
                        {/* Detalle cotizaciones */}
                        <div className="bg-gray-50 border-t border-gray-100">
                          {cots.map(cot => (
                            <CotizacionRow key={cot.id} cot={cot} isAdmin={isAdmin} onUpdate={() => loadPresupuesto()} />
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })}
            {categorias.every(c => c.lineas.every(l => !(l.cotizaciones ?? []).length)) && (
              <div className="card p-8 text-center text-gray-400 text-sm">
                <p className="text-3xl mb-2">📬</p>
                No hay cotizaciones registradas aún
              </div>
            )}
          </div>

          {/* Boletos reales — solo eventos propios */}
          {!isContratado && <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900">🎟️ Boletos Vendidos Reales</h2>
              <div className="flex items-center gap-3">
                <label className={`text-sm cursor-pointer px-3 py-1.5 rounded-xl border-2 border-amber-300 text-amber-700 hover:bg-amber-50 font-medium transition-all ${extractingBol ? 'opacity-50 pointer-events-none' : ''}`}>
                  {extractingBol ? '⏳ Analizando...' : '🤖 Importar con IA'}
                  <input ref={boletoRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleBoletosUpload(f); e.target.value = '' }} />
                </label>
                <button type="button" onClick={() => setBoletosReal(prev => [...prev, { zona:'', vendidos:0, precio:0 }])} className="text-sm text-blue-500 hover:underline">+ Agregar zona</button>
              </div>
            </div>
            {extractBolError && <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl px-4 py-3 text-sm mb-3">{extractBolError}</div>}
            <table className="w-full text-sm">
              <thead><tr className="bg-gray-50 text-gray-400 text-xs">
                <th className="px-3 py-2 text-left">Zona</th>
                <th className="px-3 py-2 text-right">Vendidos</th>
                <th className="px-3 py-2 text-right">Precio USD</th>
                <th className="px-3 py-2 text-right">Total USD</th>
                <th className="px-3 py-2 text-left">Match IA</th>
                <th className="px-2 py-2"/>
              </tr></thead>
              <tbody className="divide-y divide-gray-100">
                {boletosReal.map((b, bi) => {
                  function upd(field: keyof BoletoReal, val: string|number) { setBoletosReal(prev => prev.map((x,xi) => xi===bi ? {...x,[field]:val} : x)) }
                  const matchColor = b.match === 'EXACTO' ? 'text-green-600 bg-green-50' : b.match === 'APROXIMADO' ? 'text-amber-600 bg-amber-50' : b.match === 'NUEVO' ? 'text-blue-600 bg-blue-50' : ''
                  return (
                    <tr key={bi} className="hover:bg-gray-50">
                      <td className="px-3 py-2"><input className="bg-transparent outline-none border-b border-transparent focus:border-gray-300 font-medium w-36" value={b.zona} onChange={e => upd('zona',e.target.value)} /></td>
                      <td className="px-3 py-2"><input type="number" className="w-20 bg-transparent outline-none border-b border-transparent focus:border-gray-300 text-right" value={b.vendidos} onChange={e => upd('vendidos',parseInt(e.target.value)||0)} /></td>
                      <td className="px-3 py-2"><input type="number" className="w-24 bg-transparent outline-none border-b border-transparent focus:border-gray-300 text-right" value={b.precio} onChange={e => upd('precio',parseFloat(e.target.value)||0)} /></td>
                      <td className="px-3 py-2 text-right font-semibold text-green-600">{fmt(num(b.vendidos)*num(b.precio))}</td>
                      <td className="px-3 py-2">
                        {b.match && <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${matchColor}`}>{b.match}</span>}
                        {b.nota && <p className="text-xs text-gray-400 mt-0.5">{b.nota}</p>}
                      </td>
                      <td className="px-2 py-2"><button type="button" onClick={() => setBoletosReal(prev => prev.filter((_,xi)=>xi!==bi))} className="text-red-300 hover:text-red-500">✕</button></td>
                    </tr>
                  )
                })}
              </tbody>
              {boletosReal.length > 0 && <tfoot><tr className="bg-gray-50 font-semibold text-sm">
                <td className="px-3 py-2 text-gray-500" colSpan={3}>Total</td>
                <td className="px-3 py-2 text-right text-green-600">{fmt(ticketRealIncome)}</td><td />
              </tr></tfoot>}
            </table>
          </div>

          }

          {/* Patrocinios reales — solo eventos propios */}
          {!isContratado && <PatrociniosSection title="🤝 Patrocinios Reales Cobrados" patrocinios={patroReal} patrocinadores={patrocinadores} onChange={setPatroReal} />}
        </div>
      )}

      {/* ════ TAB: COMPARACIÓN ════ */}
      {tab === 'comparacion' && (
        <div className="space-y-6">
          <div className="grid grid-cols-3 gap-4">
            <KpiCard label="Presupuesto Total"   value={fmt(presupTotal)}   color="amber" />
            <KpiCard label="Costos Reales"        value={fmt(costoRealCot)}  color={costoRealCot > presupTotal ? 'red' : 'green'} sub={costoRealCot > presupTotal ? '⚠ Excede presupuesto' : '✓ Dentro del presupuesto'} />
            <KpiCard label="Variación"            value={fmt(presupTotal - costoRealCot)} color={presupTotal - costoRealCot >= 0 ? 'green' : 'red'} sub={`${Math.round(((presupTotal - costoRealCot)/Math.max(1,presupTotal))*100)}% del presupuesto`} />
            <KpiCard label="Ingreso Estimado"     value={fmt(totalIncome)}      color="blue" />
            <KpiCard label="Ingreso Real"          value={fmt(totalRealIncome)}  color={totalRealIncome >= totalIncome ? 'green' : 'amber'} />
            <KpiCard label="Variación Ingresos"   value={fmt(totalRealIncome - totalIncome)} color={totalRealIncome >= totalIncome ? 'green' : 'red'} />
          </div>

          {/* Tabla comparativa por categoría */}
          <div className="card p-5">
            <h2 className="font-semibold text-gray-900 mb-4">Comparativa Categoría por Categoría</h2>
            <table className="w-full text-sm">
              <thead><tr className="bg-gray-50 text-gray-400 text-xs">
                <th className="px-4 py-2 text-left">Categoría / Subcategoría</th>
                <th className="px-4 py-2 text-right">Presupuesto</th>
                <th className="px-4 py-2 text-right">Real aprobado</th>
                <th className="px-4 py-2 text-right">Variación</th>
                <th className="px-4 py-2 text-right">% Uso</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-100">
                {categorias.map(cat => {
                  const catPresup = cat.lineas.reduce((s, l) => s + num(l.montoUsd), 0)
                  const catReal   = cat.lineas.reduce((s, l) => s + (l.cotizaciones ?? []).filter(c => c.estado === 'APROBADA').reduce((ss, c) => ss + c.montoTotal, 0), 0)
                  const catDiff   = catPresup - catReal
                  const catPct    = catPresup > 0 ? Math.round((catReal/catPresup)*100) : 0
                  return [
                    <tr key={`cat-${cat.nombre}`} className="bg-gray-50 font-semibold">
                      <td className="px-4 py-2 text-gray-900">{cat.nombre}</td>
                      <td className="px-4 py-2 text-right">{fmt(catPresup)}</td>
                      <td className="px-4 py-2 text-right">{fmt(catReal)}</td>
                      <td className={`px-4 py-2 text-right ${catDiff >= 0 ? 'text-green-600' : 'text-red-600'}`}>{catDiff >= 0 ? '+' : ''}{fmt(catDiff)}</td>
                      <td className="px-4 py-2 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-16 bg-gray-200 rounded-full h-1.5">
                            <div className={`h-1.5 rounded-full ${catPct > 100 ? 'bg-red-400' : 'bg-green-400'}`} style={{width:`${Math.min(100,catPct)}%`}} />
                          </div>
                          <span className={catPct > 100 ? 'text-red-600' : 'text-gray-600'}>{catPct}%</span>
                        </div>
                      </td>
                    </tr>,
                    ...cat.lineas.map(l => {
                      const lReal = (l.cotizaciones ?? []).filter(c => c.estado === 'APROBADA').reduce((s, c) => s + c.montoTotal, 0)
                      const lDiff = num(l.montoUsd) - lReal
                      const lPct  = num(l.montoUsd) > 0 ? Math.round((lReal/num(l.montoUsd))*100) : 0
                      return (
                        <tr key={`lin-${l.descripcion}`} className="hover:bg-gray-50">
                          <td className="px-4 py-2 pl-8 text-gray-600 text-xs">{l.descripcion}
                            {l.asignadoA && <span className="text-gray-400 ml-2">({l.asignadoA.name ?? l.asignadoA.email})</span>}
                          </td>
                          <td className="px-4 py-2 text-right text-xs">{fmt(num(l.montoUsd))}</td>
                          <td className="px-4 py-2 text-right text-xs">{fmt(lReal)}</td>
                          <td className={`px-4 py-2 text-right text-xs ${lDiff >= 0 ? 'text-green-500' : 'text-red-500'}`}>{lDiff >= 0 ? '+' : ''}{fmt(lDiff)}</td>
                          <td className="px-4 py-2 text-right text-xs">
                            <span className={lPct > 100 ? 'text-red-500 font-semibold' : 'text-gray-500'}>{lPct}%</span>
                          </td>
                        </tr>
                      )
                    })
                  ]
                })}
              </tbody>
              <tfoot><tr className="bg-gray-100 font-bold text-sm">
                <td className="px-4 py-2">TOTAL</td>
                <td className="px-4 py-2 text-right">{fmt(presupTotal)}</td>
                <td className="px-4 py-2 text-right">{fmt(costoRealCot)}</td>
                <td className={`px-4 py-2 text-right ${presupTotal - costoRealCot >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {presupTotal - costoRealCot >= 0 ? '+' : ''}{fmt(presupTotal - costoRealCot)}
                </td>
                <td className="px-4 py-2 text-right">{presupTotal > 0 ? Math.round((costoRealCot/presupTotal)*100) : 0}%</td>
              </tr></tfoot>
            </table>
          </div>

          {/* Comparativa ingresos — solo eventos propios */}
          {!isContratado && <div className="card p-5">
            <h2 className="font-semibold text-gray-900 mb-4">Comparativa de Ingresos</h2>
            <table className="w-full text-sm">
              <thead><tr className="bg-gray-50 text-gray-400 text-xs">
                <th className="px-4 py-2 text-left">Concepto</th>
                <th className="px-4 py-2 text-right">Presupuesto</th>
                <th className="px-4 py-2 text-right">Real</th>
                <th className="px-4 py-2 text-right">Variación</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-100">
                {[
                  ['🎟️ Boletos', ticketIncome, ticketRealIncome],
                  ['🤝 Patrocinios', sponsorIncome, patroRealIncome],
                  ['💰 Total Ingresos', totalIncome, totalRealIncome],
                ].map(([label, presup, real]) => (
                  <tr key={String(label)} className={String(label).includes('Total') ? 'bg-gray-50 font-semibold' : 'hover:bg-gray-50'}>
                    <td className="px-4 py-2 text-gray-900">{String(label)}</td>
                    <td className="px-4 py-2 text-right">{fmt(Number(presup))}</td>
                    <td className="px-4 py-2 text-right">{fmt(Number(real))}</td>
                    <td className={`px-4 py-2 text-right font-medium ${Number(real) >= Number(presup) ? 'text-green-600' : 'text-red-600'}`}>
                      {Number(real) >= Number(presup) ? '+' : ''}{fmt(Number(real) - Number(presup))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>}
        </div>
      )}
    </div>
  )
}

/* ─── Sección de patrocinios reutilizable ─── */
function PatrociniosSection({ title, patrocinios, patrocinadores, onChange }: {
  title: string; patrocinios: Patrocinio[]; patrocinadores: Patrocinador[]
  onChange: (p: Patrocinio[]) => void
}) {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-gray-900">{title}</h2>
        <button type="button" onClick={() => onChange([...patrocinios, { patrocinadorId:'', nombre:'', tipo:'', tipoPago:'', montoLocal:0, montoUsd:0, notas:'' }])}
          className="text-sm text-blue-500 hover:underline">+ Agregar</button>
      </div>
      {patrocinios.length === 0 ? (
        <p className="text-gray-400 text-sm text-center py-4">Sin patrocinios registrados</p>
      ) : (
        <div className="space-y-3">
          {patrocinios.map((p, pi) => {
            function upd(field: keyof Patrocinio, val: string|number) {
              onChange(patrocinios.map((x, xi) => {
                if (xi !== pi) return x
                const updated = { ...x, [field]: val }
                if (field === 'patrocinadorId') { const found = patrocinadores.find(pd => pd.id === val); updated.nombre = found?.nombre ?? '' }
                return updated
              }))
            }
            return (
              <div key={pi} className="card p-4 space-y-3 border border-gray-100">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Patrocinador</label>
                    <select className="input" value={p.patrocinadorId} onChange={e => upd('patrocinadorId', e.target.value)}>
                      <option value="">Seleccionar...</option>
                      {patrocinadores.map(pd => <option key={pd.id} value={pd.id}>{pd.nombre}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label">Tipo</label>
                    <div className="flex gap-2">
                      {[['PATROCINIO','Patrocinio'],['BTL','BTL'],['BRANDING','Branding']].map(([val, lbl]) => (
                        <button key={val} type="button" onClick={() => upd('tipo', val)}
                          className={`flex-1 py-2 rounded-xl border-2 text-xs font-medium transition-all ${p.tipo===val ? 'border-gray-900 bg-gray-50' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
                          {lbl}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-3">
                  <div>
                    <label className="label">Pago</label>
                    <div className="flex gap-2">
                      {[['EFECTIVO','💵'],['CANJE','🔄']].map(([val,lbl]) => (
                        <button key={val} type="button" onClick={() => upd('tipoPago', val)}
                          className={`flex-1 py-2 rounded-xl border-2 text-xs font-medium transition-all ${p.tipoPago===val ? 'border-gray-900 bg-gray-50' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
                          {lbl}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div><label className="label">Local</label><input type="number" className="input" value={p.montoLocal} onChange={e => upd('montoLocal', parseFloat(e.target.value)||0)} /></div>
                  <div><label className="label">USD</label><input type="number" className="input" value={p.montoUsd} onChange={e => upd('montoUsd', parseFloat(e.target.value)||0)} /></div>
                  <div><label className="label">Notas</label><input className="input" value={p.notas} onChange={e => upd('notas', e.target.value)} /></div>
                </div>
                <div className="flex justify-end">
                  <button type="button" onClick={() => onChange(patrocinios.filter((_,xi) => xi!==pi))} className="text-xs text-red-400 hover:text-red-600">✕ Eliminar</button>
                </div>
              </div>
            )
          })}
          <div className="flex justify-end pt-2 font-semibold text-sm text-gray-700">
            Total: {new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:0}).format(patrocinios.reduce((s,p)=>s+num(p.montoUsd),0))}
          </div>
        </div>
      )}
    </div>
  )
}






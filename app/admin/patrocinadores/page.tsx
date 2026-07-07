'use client'

import { useEffect, useRef, useState } from 'react'
import { formatDate } from '@/lib/utils'

interface Evento       { nombre: string; fechaInicio: string }
interface Presupuesto  { evento: Evento }
interface Patrocinio   { id: string; nombre: string; tipo: string | null; tipoPago: string | null; montoUsd: number; presupuesto: Presupuesto }
interface Patrocinador {
  id: string; nombre: string; categoria: string | null; patrocinios: Patrocinio[]
  contratoPath: string | null; contratoNombre: string | null
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload  = () => resolve((reader.result as string).split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

const TIPO_LABELS: Record<string, string> = { ACTIVACION: 'Activación', BTL: 'BTL', BRANDING: 'Branding' }
const PAGO_LABELS: Record<string, string> = { CANJE: 'Canje', EFECTIVO: 'Efectivo' }

const CATEGORIAS = [
  { value: 'ALCOHOL',       label: '🍺 Alcohol' },
  { value: 'BANCO',         label: '🏦 Banco' },
  { value: 'COMIDA_RAPIDA', label: '🍔 Comida Rápida' },
  { value: 'AEROLINEA',     label: '✈️ Aerolínea' },
  { value: 'HOTEL',         label: '🏨 Hotel' },
  { value: 'MODA',          label: '👗 Moda/Maquillaje' },
  { value: 'RENTAL_CAR',    label: '🚗 Rental Car' },
]
const CAT_LABELS: Record<string, string> = Object.fromEntries(CATEGORIAS.map(c => [c.value, c.label]))

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(n)
}

/* ── Formulario de creación — componente separado para evitar re-mount ── */
function CreateForm({ onCreated }: { onCreated: (p: Patrocinador) => void }) {
  const [nombre,    setNombre]    = useState('')
  const [categoria, setCategoria] = useState('')
  const [contrato,  setContrato]  = useState<File | null>(null)
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')

    let contratoPayload = null
    if (contrato) {
      const base64 = await fileToBase64(contrato)
      contratoPayload = { base64, mimeType: contrato.type, fileName: contrato.name }
    }

    const res = await fetch('/api/patrocinadores', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre, categoria: categoria || null, contrato: contratoPayload }),
    })
    if (res.ok) {
      const p = await res.json()
      onCreated({ ...p, patrocinios: [] })
      setNombre(''); setCategoria(''); setContrato(null)
    } else {
      const data = await res.json().catch(() => null)
      setError(data?.error ?? 'Error al crear el patrocinador')
    }
    setLoading(false)
  }

  return (
    <div className="card p-5">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Nombre del patrocinador *</label>
            <input className="input" placeholder="Ej: Balboa, Copa Airlines..." required
              value={nombre} onChange={e => setNombre(e.target.value)} autoFocus />
          </div>
          <div>
            <label className="label">Categoría (opcional)</label>
            <select className="input" value={categoria} onChange={e => setCategoria(e.target.value)}>
              <option value="">Sin categoría</option>
              {CATEGORIAS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="label">📝 Contrato (opcional)</label>
          <div
            onClick={() => fileRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-4 cursor-pointer transition-all text-center ${
              contrato ? 'border-green-400 bg-green-50' : 'border-gray-300 hover:border-gray-400'
            }`}>
            {contrato ? (
              <div className="flex items-center justify-center gap-2 text-green-700 text-sm font-medium">
                <span>📎</span><span>{contrato.name}</span>
                <button type="button" onClick={e => { e.stopPropagation(); setContrato(null) }}
                  className="text-red-400 hover:text-red-600 ml-2">✕</button>
              </div>
            ) : (
              <p className="text-gray-500 text-sm">📎 Haz clic para adjuntar el contrato (PDF, Word o imagen)</p>
            )}
          </div>
          <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) setContrato(f); e.target.value = '' }} />
        </div>

        {error && <p className="text-red-500 text-sm">{error}</p>}

        <button type="submit" disabled={loading} className="btn-primary">
          {loading ? (contrato ? '📤 Subiendo contrato...' : 'Guardando...') : 'Crear Patrocinador'}
        </button>
      </form>
    </div>
  )
}

/* ── Página principal ── */
export default function PatrocinadoresPage() {
  const [patrocinadores, setPatrocinadores] = useState<Patrocinador[]>([])
  const [selected,       setSelected]       = useState<Patrocinador | null>(null)
  const [showForm,       setShowForm]       = useState(false)
  const [editing,        setEditing]        = useState<Patrocinador | null>(null)
  const [editNombre,     setEditNombre]     = useState('')
  const [editCategoria,  setEditCategoria]  = useState('')
  const [editContrato,   setEditContrato]   = useState<File | null>(null)
  const [loading,        setLoading]        = useState(false)
  const [search,         setSearch]         = useState('')
  const [filtroCat,      setFiltroCat]      = useState('')

  useEffect(() => {
    fetch('/api/patrocinadores').then(r => r.json()).then(d => setPatrocinadores(Array.isArray(d) ? d : []))
  }, [])

  function handleCreated(p: Patrocinador) {
    setPatrocinadores(prev => [...prev, p].sort((a, b) => a.nombre.localeCompare(b.nombre)))
    setShowForm(false)
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editing) return
    setLoading(true)

    let contratoPayload = null
    if (editContrato) {
      const base64 = await fileToBase64(editContrato)
      contratoPayload = { base64, mimeType: editContrato.type, fileName: editContrato.name }
    }

    const res = await fetch(`/api/patrocinadores/${editing.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre: editNombre, categoria: editCategoria || null, contrato: contratoPayload }),
    })
    if (res.ok) {
      const updated = await res.json()
      const merge = (p: Patrocinador) => ({
        ...p,
        nombre: updated.nombre,
        categoria: updated.categoria,
        contratoPath: updated.contratoPath ?? p.contratoPath,
        contratoNombre: updated.contratoNombre ?? p.contratoNombre,
      })
      setPatrocinadores(prev => prev.map(p => p.id === updated.id ? merge(p) : p))
      if (selected?.id === editing.id) setSelected(s => s ? merge(s) : s)
      setEditing(null)
      setEditContrato(null)
    }
    setLoading(false)
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Desactivar este patrocinador?')) return
    const res = await fetch(`/api/patrocinadores/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setPatrocinadores(prev => prev.filter(p => p.id !== id))
      if (selected?.id === id) setSelected(null)
    }
  }

  const filtered = patrocinadores.filter(p =>
    p.nombre.toLowerCase().includes(search.toLowerCase()) &&
    (!filtroCat || p.categoria === filtroCat)
  )
  const selectedTotal = selected?.patrocinios.reduce((s, p) => s + (p.montoUsd ?? 0), 0) ?? 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Patrocinadores</h1>
          <p className="text-gray-500 mt-1">{patrocinadores.length} patrocinador(es) registrado(s)</p>
        </div>
        <button onClick={() => setShowForm(v => !v)} className="btn-primary">
          {showForm ? 'Cancelar' : '+ Nuevo Patrocinador'}
        </button>
      </div>

      {showForm && <CreateForm onCreated={handleCreated} />}

      <div className="flex gap-3 flex-wrap items-center">
        <input className="input max-w-sm" placeholder="Buscar patrocinador..."
          value={search} onChange={e => setSearch(e.target.value)} />
        <div className="flex gap-1.5 flex-wrap">
          <button
            onClick={() => setFiltroCat('')}
            className={`text-xs px-3 py-1.5 rounded-full border-2 font-medium transition-all ${
              !filtroCat ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 text-gray-500 hover:border-gray-400'
            }`}>
            Todos
          </button>
          {CATEGORIAS.map(c => (
            <button key={c.value}
              onClick={() => setFiltroCat(filtroCat === c.value ? '' : c.value)}
              className={`text-xs px-3 py-1.5 rounded-full border-2 font-medium transition-all ${
                filtroCat === c.value ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 text-gray-500 hover:border-gray-400'
              }`}>
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-5 gap-6">
        {/* Lista */}
        <div className="col-span-2 space-y-2">
          {filtered.map(p => (
            <button key={p.id} onClick={() => setSelected(p)}
              className={`card w-full text-left p-4 hover:border-gray-400 hover:shadow-md transition-all ${selected?.id === p.id ? 'border-gray-400 shadow-md' : ''}`}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-gray-900">{p.nombre}</p>
                    {p.categoria && <span className="text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full">{CAT_LABELS[p.categoria] ?? p.categoria}</span>}
                    {p.contratoPath && <span className="text-xs" title={`Contrato: ${p.contratoNombre ?? ''}`}>📝</span>}
                  </div>
                  <p className="text-gray-400 text-xs mt-0.5">{p.patrocinios.length} evento(s) · {fmt(p.patrocinios.reduce((s, x) => s + (x.montoUsd ?? 0), 0))}</p>
                </div>
                <div className="flex gap-1 shrink-0 ml-2">
                  <button onClick={e => { e.stopPropagation(); setEditing(p); setEditNombre(p.nombre); setEditCategoria(p.categoria ?? '') }}
                    className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-all">✏️</button>
                  <button onClick={e => { e.stopPropagation(); handleDelete(p.id) }}
                    className="p-1.5 rounded-lg hover:bg-red-50 text-red-300 transition-all">🗑</button>
                </div>
              </div>
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="card p-8 text-center">
              <p className="text-3xl mb-3">🤝</p>
              <p className="text-gray-700 font-semibold">No hay patrocinadores aún</p>
            </div>
          )}
        </div>

        {/* Detalle */}
        {selected && (
          <div className="col-span-3 space-y-4">
            <div className="card p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-bold text-gray-900">{selected.nombre}</h3>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {selected.categoria && <span className="text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full">{CAT_LABELS[selected.categoria] ?? selected.categoria}</span>}
                    {selected.contratoPath && (
                      <a href={`/api/fotos?path=${encodeURIComponent(selected.contratoPath)}`}
                        target="_blank" rel="noopener noreferrer"
                        className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full hover:bg-green-200 transition-colors">
                        📝 Ver contrato
                      </a>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-400">Monto total acumulado</p>
                  <p className="text-2xl font-bold text-amber-600">{fmt(selectedTotal)}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="card p-3 text-center border-l-4 border-l-blue-400">
                  <p className="text-2xl font-bold text-gray-900">{selected.patrocinios.length}</p>
                  <p className="text-gray-500 text-xs mt-1">Eventos participados</p>
                </div>
                <div className="card p-3 text-center border-l-4 border-l-amber-400">
                  <p className="text-2xl font-bold text-amber-600">{fmt(selectedTotal)}</p>
                  <p className="text-gray-500 text-xs mt-1">Monto total</p>
                </div>
              </div>
            </div>

            {selected.patrocinios.length > 0 && (
              <div className="card p-5">
                <h4 className="font-semibold text-gray-700 text-sm uppercase tracking-wide mb-3">Historial por evento</h4>
                <div className="space-y-2">
                  {selected.patrocinios.map(pat => (
                    <div key={pat.id} className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3">
                      <div>
                        <p className="font-medium text-gray-900 text-sm">{pat.presupuesto.evento.nombre}</p>
                        <div className="flex gap-2 mt-0.5">
                          <p className="text-gray-400 text-xs">{formatDate(pat.presupuesto.evento.fechaInicio)}</p>
                          {pat.tipo     && <span className="text-xs bg-blue-100 text-blue-600 px-1.5 rounded-full">{TIPO_LABELS[pat.tipo] ?? pat.tipo}</span>}
                          {pat.tipoPago && <span className="text-xs bg-green-100 text-green-600 px-1.5 rounded-full">{PAGO_LABELS[pat.tipoPago] ?? pat.tipoPago}</span>}
                        </div>
                      </div>
                      <p className="font-bold text-gray-900">{fmt(pat.montoUsd ?? 0)}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal edición */}
      {editing && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="card p-6 w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-900">Editar Patrocinador</h2>
              <button onClick={() => setEditing(null)} className="text-gray-400 hover:text-gray-700">✕</button>
            </div>
            <form onSubmit={handleEdit} className="space-y-3">
              <div>
                <label className="label">Nombre</label>
                <input className="input" required value={editNombre} onChange={e => setEditNombre(e.target.value)} />
              </div>
              <div>
                <label className="label">Categoría</label>
                <select className="input" value={editCategoria} onChange={e => setEditCategoria(e.target.value)}>
                  <option value="">Sin categoría</option>
                  {CATEGORIAS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <label className="label">📝 Contrato</label>
                {editing.contratoPath && !editContrato && (
                  <p className="text-xs text-gray-400 mb-1.5">
                    Ya tiene contrato:{' '}
                    <a href={`/api/fotos?path=${encodeURIComponent(editing.contratoPath)}`}
                      target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
                      {editing.contratoNombre ?? 'ver'}
                    </a>
                    {' '}— al subir uno nuevo lo reemplaza
                  </p>
                )}
                <label className={`block border-2 border-dashed rounded-xl p-3 cursor-pointer transition-all text-center ${
                  editContrato ? 'border-green-400 bg-green-50' : 'border-gray-300 hover:border-gray-400'
                }`}>
                  {editContrato ? (
                    <span className="flex items-center justify-center gap-2 text-green-700 text-sm font-medium">
                      📎 {editContrato.name}
                      <button type="button" onClick={e => { e.preventDefault(); e.stopPropagation(); setEditContrato(null) }}
                        className="text-red-400 hover:text-red-600 ml-1">✕</button>
                    </span>
                  ) : (
                    <span className="text-gray-500 text-sm">📎 {editing.contratoPath ? 'Reemplazar contrato' : 'Adjuntar contrato'} (PDF, Word o imagen)</span>
                  )}
                  <input type="file" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) setEditContrato(f); e.target.value = '' }} />
                </label>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => { setEditing(null); setEditContrato(null) }} className="btn-ghost flex-1">Cancelar</button>
                <button type="submit" disabled={loading} className="btn-primary flex-1">
                  {loading ? (editContrato ? '📤 Subiendo...' : '...') : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

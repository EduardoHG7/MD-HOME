'use client'

import { useEffect, useState } from 'react'

interface Material { id: string; nombre: string; unidad: string }
interface Receta { materialId: string; cantidadPorM2: number; cantidadPorMetroPerimetro: number }
interface Producto {
  id: string; nombre: string; formula: 'AREA' | 'AREA_PERIMETRO'
  manoObra: number; margenA: number; margenB: number; margenC: number
  materiales: Receta[]
}

type FormState = {
  nombre: string; formula: 'AREA' | 'AREA_PERIMETRO'
  manoObra: string; margenA: string; margenB: string; margenC: string
  materiales: { materialId: string; cantidadPorM2: string; cantidadPorMetroPerimetro: string }[]
}

const FORM_VACIO = (): FormState => ({
  nombre: '', formula: 'AREA', manoObra: '0', margenA: '40', margenB: '30', margenC: '20', materiales: [],
})

function ProductoForm({ materiales, inicial, onGuardar, onCancelar }: {
  materiales: Material[]
  inicial?: Producto
  onGuardar: (f: FormState) => Promise<void>
  onCancelar: () => void
}) {
  const [form, setForm] = useState<FormState>(inicial ? {
    nombre: inicial.nombre, formula: inicial.formula,
    manoObra: String(inicial.manoObra), margenA: String(inicial.margenA), margenB: String(inicial.margenB), margenC: String(inicial.margenC),
    materiales: inicial.materiales.map(m => ({ materialId: m.materialId, cantidadPorM2: String(m.cantidadPorM2), cantidadPorMetroPerimetro: String(m.cantidadPorMetroPerimetro) })),
  } : FORM_VACIO())
  const [guardando, setGuardando] = useState(false)

  function agregarReceta() { setForm(f => ({ ...f, materiales: [...f.materiales, { materialId: '', cantidadPorM2: '0', cantidadPorMetroPerimetro: '0' }] })) }
  function actualizarReceta(i: number, campo: string, valor: string) {
    setForm(f => ({ ...f, materiales: f.materiales.map((m, idx) => idx === i ? { ...m, [campo]: valor } : m) }))
  }
  function quitarReceta(i: number) { setForm(f => ({ ...f, materiales: f.materiales.filter((_, idx) => idx !== i) })) }

  return (
    <div className="card p-5 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="label">Nombre del producto *</label>
          <input className="input" value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} />
        </div>
        <div>
          <label className="label">Fórmula de consumo</label>
          <select className="input" value={form.formula} onChange={e => setForm(f => ({ ...f, formula: e.target.value as 'AREA' | 'AREA_PERIMETRO' }))}>
            <option value="AREA">Por área (ancho × alto)</option>
            <option value="AREA_PERIMETRO">Área + perímetro</option>
          </select>
        </div>
        <div>
          <label className="label">Mano de obra ($/m²)</label>
          <input className="input" type="number" step="0.01" value={form.manoObra} onChange={e => setForm(f => ({ ...f, manoObra: e.target.value }))} />
        </div>
        <div>
          <label className="label">Margen A (Premium %)</label>
          <input className="input" type="number" step="1" value={form.margenA} onChange={e => setForm(f => ({ ...f, margenA: e.target.value }))} />
        </div>
        <div>
          <label className="label">Margen B (Regular %)</label>
          <input className="input" type="number" step="1" value={form.margenB} onChange={e => setForm(f => ({ ...f, margenB: e.target.value }))} />
        </div>
        <div>
          <label className="label">Margen C (Al Detal %)</label>
          <input className="input" type="number" step="1" value={form.margenC} onChange={e => setForm(f => ({ ...f, margenC: e.target.value }))} />
        </div>
      </div>

      <div>
        <p className="label mb-1.5">Receta de materiales</p>
        <div className="space-y-2">
          {form.materiales.map((m, i) => (
            <div key={i} className="grid grid-cols-[1fr_120px_140px_32px] gap-2 items-center">
              <select className="input" value={m.materialId} onChange={e => actualizarReceta(i, 'materialId', e.target.value)}>
                <option value="">Seleccionar material...</option>
                {materiales.map(mat => <option key={mat.id} value={mat.id}>{mat.nombre}</option>)}
              </select>
              <input className="input" type="number" step="0.001" placeholder="Cant. por m²" value={m.cantidadPorM2}
                onChange={e => actualizarReceta(i, 'cantidadPorM2', e.target.value)} />
              {form.formula === 'AREA_PERIMETRO' && (
                <input className="input" type="number" step="0.001" placeholder="Cant. por m perímetro" value={m.cantidadPorMetroPerimetro}
                  onChange={e => actualizarReceta(i, 'cantidadPorMetroPerimetro', e.target.value)} />
              )}
              <button onClick={() => quitarReceta(i)} className="text-red-300 hover:text-red-600 text-sm">🗑</button>
            </div>
          ))}
        </div>
        <button onClick={agregarReceta} className="btn-ghost text-xs mt-2">+ Agregar material a la receta</button>
      </div>

      <div className="flex gap-2 pt-2">
        <button onClick={onCancelar} className="btn-ghost flex-1">Cancelar</button>
        <button onClick={async () => { setGuardando(true); await onGuardar(form); setGuardando(false) }} disabled={guardando} className="btn-primary flex-1">
          {guardando ? 'Guardando...' : 'Guardar producto'}
        </button>
      </div>
    </div>
  )
}

export function ProductosPM() {
  const [productos, setProductos] = useState<Producto[]>([])
  const [materiales, setMateriales] = useState<Material[]>([])
  const [creando, setCreando] = useState(false)
  const [editando, setEditando] = useState<Producto | null>(null)

  function cargar() {
    fetch('/api/pm/productos').then(r => r.json()).then(d => setProductos(Array.isArray(d) ? d : []))
    fetch('/api/pm/materiales').then(r => r.json()).then(d => setMateriales(Array.isArray(d) ? d : []))
  }
  useEffect(cargar, [])

  async function crear(f: FormState) {
    await fetch('/api/pm/productos', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nombre: f.nombre, formula: f.formula, manoObra: f.manoObra, margenA: f.margenA, margenB: f.margenB, margenC: f.margenC,
        materiales: f.materiales.filter(m => m.materialId),
      }),
    })
    setCreando(false); cargar()
  }

  async function editar(id: string, f: FormState) {
    await fetch(`/api/pm/productos/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nombre: f.nombre, formula: f.formula, manoObra: f.manoObra, margenA: f.margenA, margenB: f.margenB, margenC: f.margenC,
        materiales: f.materiales.filter(m => m.materialId),
      }),
    })
    setEditando(null); cargar()
  }

  async function eliminar(id: string) {
    if (!confirm('¿Desactivar este producto?')) return
    await fetch(`/api/pm/productos/${id}`, { method: 'DELETE' })
    cargar()
  }

  return (
    <div className="card p-5 space-y-4">
      <div>
        <h2 className="font-semibold text-gray-900">Productos paramétricos</h2>
        <p className="text-gray-400 text-sm mt-0.5">
          Cada producto define cuánto consume de cada material por m² o por metro de perímetro, más mano de obra y el margen objetivo de cada nivel de precio (A/B/C).
        </p>
      </div>

      <div className="space-y-2">
        {productos.map(p => (
          <div key={p.id}>
            {editando?.id === p.id ? (
              <ProductoForm materiales={materiales} inicial={p} onGuardar={f => editar(p.id, f)} onCancelar={() => setEditando(null)} />
            ) : (
              <div className="flex items-center justify-between p-3 rounded-xl border border-gray-200">
                <div>
                  <p className="font-medium text-gray-900">{p.nombre}</p>
                  <p className="text-xs text-gray-400">{p.formula === 'AREA_PERIMETRO' ? 'área + perímetro' : 'por área'}</p>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => setEditando(p)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">✏️</button>
                  <button onClick={() => eliminar(p.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-300">🗑</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {creando ? (
        <ProductoForm materiales={materiales} onGuardar={crear} onCancelar={() => setCreando(false)} />
      ) : (
        <button onClick={() => setCreando(true)} className="btn-ghost w-full">+ Nuevo producto paramétrico</button>
      )}
    </div>
  )
}

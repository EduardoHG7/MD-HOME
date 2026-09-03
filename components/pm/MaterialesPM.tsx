'use client'

import { useEffect, useState } from 'react'

interface Material { id: string; nombre: string; unidad: string; costoUnitario: number }

export function MaterialesPM() {
  const [materiales, setMateriales] = useState<Material[]>([])
  const [ediciones, setEdiciones] = useState<Record<string, { nombre: string; unidad: string; costoUnitario: string }>>({})
  const [nuevo, setNuevo] = useState({ nombre: '', unidad: '', costoUnitario: '' })
  const [guardando, setGuardando] = useState(false)

  function cargar() {
    fetch('/api/pm/materiales').then(r => r.json()).then(d => {
      const lista = Array.isArray(d) ? d : []
      setMateriales(lista)
      setEdiciones(Object.fromEntries(lista.map((m: Material) => [m.id, { nombre: m.nombre, unidad: m.unidad, costoUnitario: String(m.costoUnitario) }])))
    })
  }
  useEffect(cargar, [])

  async function guardarTodo() {
    setGuardando(true)
    try {
      await Promise.all(materiales.map(m => {
        const e = ediciones[m.id]
        return fetch(`/api/pm/materiales/${m.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nombre: e.nombre, unidad: e.unidad, costoUnitario: parseFloat(e.costoUnitario) || 0 }),
        })
      }))
      cargar()
    } finally { setGuardando(false) }
  }

  async function agregar() {
    if (!nuevo.nombre.trim() || !nuevo.unidad.trim()) return
    await fetch('/api/pm/materiales', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre: nuevo.nombre, unidad: nuevo.unidad, costoUnitario: parseFloat(nuevo.costoUnitario) || 0 }),
    })
    setNuevo({ nombre: '', unidad: '', costoUnitario: '' })
    cargar()
  }

  async function eliminar(id: string) {
    if (!confirm('¿Desactivar este material?')) return
    await fetch(`/api/pm/materiales/${id}`, { method: 'DELETE' })
    cargar()
  }

  return (
    <div className="card p-5 space-y-4">
      <div>
        <h2 className="font-semibold text-gray-900">Base de datos de materiales</h2>
        <p className="text-gray-400 text-sm mt-0.5">Costos de referencia — ajústalos con tus costos reales de compra. Se usan para calcular el costo automático de cada producto.</p>
      </div>

      <div className="grid grid-cols-[1fr_120px_140px_32px] gap-3 text-xs font-semibold text-gray-400 uppercase px-1">
        <span>Material</span><span>Unidad</span><span>Costo unitario</span><span />
      </div>
      <div className="space-y-2">
        {materiales.map(m => (
          <div key={m.id} className="grid grid-cols-[1fr_120px_140px_32px] gap-3 items-center">
            <input className="input" value={ediciones[m.id]?.nombre ?? ''}
              onChange={e => setEdiciones(prev => ({ ...prev, [m.id]: { ...prev[m.id], nombre: e.target.value } }))} />
            <input className="input" value={ediciones[m.id]?.unidad ?? ''}
              onChange={e => setEdiciones(prev => ({ ...prev, [m.id]: { ...prev[m.id], unidad: e.target.value } }))} />
            <input className="input" type="number" step="0.01" value={ediciones[m.id]?.costoUnitario ?? ''}
              onChange={e => setEdiciones(prev => ({ ...prev, [m.id]: { ...prev[m.id], costoUnitario: e.target.value } }))} />
            <button onClick={() => eliminar(m.id)} className="text-red-300 hover:text-red-600 text-sm">🗑</button>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-[1fr_120px_140px_32px] gap-3 items-center pt-2 border-t border-gray-100">
        <input className="input" placeholder="Nuevo material..." value={nuevo.nombre} onChange={e => setNuevo(f => ({ ...f, nombre: e.target.value }))} />
        <input className="input" placeholder="m², m, unidad" value={nuevo.unidad} onChange={e => setNuevo(f => ({ ...f, unidad: e.target.value }))} />
        <input className="input" type="number" step="0.01" placeholder="0.00" value={nuevo.costoUnitario} onChange={e => setNuevo(f => ({ ...f, costoUnitario: e.target.value }))} />
        <button onClick={agregar} className="text-green-500 hover:text-green-700 text-lg">+</button>
      </div>

      <button onClick={guardarTodo} disabled={guardando} className="btn-primary">
        {guardando ? 'Guardando...' : 'Guardar cambios'}
      </button>
    </div>
  )
}

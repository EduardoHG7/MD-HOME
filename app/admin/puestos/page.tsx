'use client'

import { useEffect, useState } from 'react'

interface Puesto { id: string; nombre: string }

export default function PuestosAdminPage() {
  const [puestos, setPuestos] = useState<Puesto[]>([])
  const [nombre, setNombre]   = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  useEffect(() => {
    fetch('/api/puestos').then(r => r.json()).then(setPuestos)
  }, [])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!nombre.trim()) return
    setLoading(true)
    const res = await fetch('/api/puestos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre }),
    })
    const data = await res.json()
    if (res.ok) {
      setPuestos(prev => [...prev, data].sort((a, b) => a.nombre.localeCompare(b.nombre)))
      setNombre('')
    } else {
      setError(data.error ?? 'Error al crear')
    }
    setLoading(false)
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar este puesto?')) return
    await fetch('/api/puestos', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    setPuestos(prev => prev.filter(p => p.id !== id))
  }

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Puestos / Funciones</h1>
        <p className="text-gray-500 mt-1">Administra los puestos disponibles para solicitudes de personal</p>
      </div>

      {/* Formulario */}
      <div className="card p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Agregar Puesto</h2>
        <form onSubmit={handleCreate} className="flex gap-3">
          <input
            className="input flex-1"
            placeholder="Ej: Mesero(a), Bartender, Seguridad..."
            value={nombre}
            onChange={e => setNombre(e.target.value)}
            required
          />
          <button type="submit" disabled={loading} className="btn-primary whitespace-nowrap">
            {loading ? '...' : '+ Agregar'}
          </button>
        </form>
        {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
      </div>

      {/* Lista */}
      <div className="card divide-y divide-gray-100">
        {puestos.length === 0 && (
          <div className="p-8 text-center">
            <p className="text-3xl mb-2">🔧</p>
            <p className="text-gray-500">No hay puestos aún. Agrega el primero.</p>
          </div>
        )}
        {puestos.map(p => (
          <div key={p.id} className="flex items-center justify-between px-5 py-3">
            <span className="text-gray-900 font-medium">{p.nombre}</span>
            <button
              onClick={() => handleDelete(p.id)}
              className="text-red-400 hover:text-red-600 text-sm hover:bg-red-50 px-3 py-1 rounded-lg transition-all"
            >
              Eliminar
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

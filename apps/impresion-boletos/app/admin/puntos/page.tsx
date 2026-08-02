'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

type Punto = {
  id: string
  nombre: string
  token: string
  activo: boolean
  _count: { boletos: number }
}

export default function PuntosPage() {
  const [puntos, setPuntos] = useState<Punto[]>([])
  const [nombre, setNombre] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    const res = await fetch('/api/puntos')
    setPuntos(await res.json())
  }

  useEffect(() => {
    load()
  }, [])

  async function crear(e: React.FormEvent) {
    e.preventDefault()
    if (!nombre.trim()) return
    setLoading(true)
    setError('')
    const res = await fetch('/api/puntos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre }),
    })
    setLoading(false)
    if (!res.ok) {
      setError('No se pudo crear el punto')
      return
    }
    setNombre('')
    load()
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-white mb-1">Puntos de impresión</h1>
        <p className="text-sm text-gray-400">
          Cada punto es una compu/tablet con su propia impresora. Crea uno por cada entrada/mesa donde vayas a
          imprimir boletos.
        </p>
      </div>

      <form onSubmit={crear} className="flex gap-2">
        <input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Nombre del punto, ej: Entrada Principal"
          className="flex-1 rounded-lg px-3 py-2 bg-white outline-none focus:ring-2 focus:ring-brand-500"
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white font-medium px-4 py-2"
        >
          Crear
        </button>
      </form>
      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="rounded-xl border border-white/10 divide-y divide-white/10">
        {puntos.length === 0 && <p className="p-4 text-sm text-gray-400">Todavía no hay puntos de impresión.</p>}
        {puntos.map((p) => (
          <Link
            key={p.id}
            href={`/admin/puntos/${p.id}`}
            className="flex items-center justify-between px-4 py-3 hover:bg-white/5"
          >
            <div>
              <p className="text-white font-medium">{p.nombre}</p>
              <p className="text-xs text-gray-500">{p._count.boletos} boletos recibidos</p>
            </div>
            <span
              className={`text-xs px-2 py-0.5 rounded-full ${p.activo ? 'bg-green-500/20 text-green-400' : 'bg-white/10 text-gray-400'}`}
            >
              {p.activo ? 'Activo' : 'Inactivo'}
            </span>
          </Link>
        ))}
      </div>
    </div>
  )
}

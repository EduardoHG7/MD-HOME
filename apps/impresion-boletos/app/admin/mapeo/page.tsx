'use client'

import { useEffect, useState } from 'react'

type Mapping = {
  nombre: string
  apellido: string
  evento: string
  fecha: string
  codigo: string
}

const CAMPOS: { key: keyof Mapping; label: string }[] = [
  { key: 'nombre', label: 'Nombre' },
  { key: 'apellido', label: 'Apellido' },
  { key: 'evento', label: 'Evento' },
  { key: 'fecha', label: 'Fecha' },
  { key: 'codigo', label: 'Código / referencia del boleto' },
]

export default function MapeoPage() {
  const [mapping, setMapping] = useState<Mapping>({ nombre: '', apellido: '', evento: '', fecha: '', codigo: '' })
  const [payload, setPayload] = useState<Record<string, string> | null>(null)
  const [recibidoEn, setRecibidoEn] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function load() {
    const res = await fetch('/api/mapping')
    const data = await res.json()
    setMapping(data.mapping)
    setPayload(data.ultimoPayload)
    setRecibidoEn(data.ultimoRecibidoEn)
  }

  useEffect(() => {
    load()
  }, [])

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setSaved(false)
    await fetch('/api/mapping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mapping),
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  const keys = payload ? Object.keys(payload) : []

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-semibold text-white mb-1">Mapeo de campos</h1>
        <p className="text-sm text-gray-400 max-w-2xl">
          No necesitas saber de antemano cómo se llaman los campos que manda CodeREADr: manda un boleto de prueba
          desde cualquier punto (o desde CodeREADr real) y aquí abajo aparecerá el payload exacto que llegó. Elige,
          para cada dato del boleto, cuál de esas llaves usar.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <form onSubmit={guardar} className="space-y-4">
          {CAMPOS.map(({ key, label }) => (
            <div key={key}>
              <label className="text-sm text-gray-400 mb-1 block">{label}</label>
              <div className="flex gap-2">
                <input
                  list={`opciones-${key}`}
                  value={mapping[key]}
                  onChange={(e) => setMapping((m) => ({ ...m, [key]: e.target.value }))}
                  placeholder={keys.length ? 'Elige o escribe la llave del payload' : 'Ej: Nombre'}
                  className="flex-1 rounded-lg px-3 py-2 bg-white text-sm outline-none focus:ring-2 focus:ring-brand-500"
                />
                <datalist id={`opciones-${key}`}>
                  {keys.map((k) => (
                    <option key={k} value={k} />
                  ))}
                </datalist>
              </div>
            </div>
          ))}
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white font-medium px-4 py-2"
          >
            {saving ? 'Guardando…' : saved ? 'Guardado ✓' : 'Guardar mapeo'}
          </button>
        </form>

        <div>
          <p className="text-sm text-gray-400 mb-1">
            Último payload recibido{recibidoEn ? ` — ${new Date(recibidoEn).toLocaleString('es-PA')}` : ''}
          </p>
          <pre className="rounded-xl border border-white/10 bg-black/40 p-4 text-xs text-green-300 overflow-auto max-h-[28rem]">
            {payload ? JSON.stringify(payload, null, 2) : 'Todavía no se ha recibido ningún boleto.'}
          </pre>
        </div>
      </div>
    </div>
  )
}

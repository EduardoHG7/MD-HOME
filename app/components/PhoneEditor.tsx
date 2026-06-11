'use client'

import { useState } from 'react'

export default function PhoneEditor({ telefono: initial }: { telefono: string | null }) {
  const [telefono, setTelefono] = useState(initial ?? '')
  const [editing, setEditing]   = useState(false)
  const [loading, setLoading]   = useState(false)
  const [saved, setSaved]       = useState(false)

  async function handleSave() {
    setLoading(true)
    await fetch('/api/perfil', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ telefono }),
    })
    setLoading(false)
    setEditing(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">📱</span>
        <h2 className="text-sm font-semibold text-gray-700">Notificaciones WhatsApp</h2>
        {saved && <span className="ml-auto text-xs text-green-600 font-medium">✓ Guardado</span>}
      </div>

      {editing ? (
        <div className="flex gap-2">
          <input
            type="tel"
            value={telefono}
            onChange={e => setTelefono(e.target.value)}
            placeholder="+507XXXXXXXX"
            className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
          />
          <button
            onClick={handleSave}
            disabled={loading}
            className="px-4 py-2 bg-gray-900 text-white rounded-xl text-sm font-medium disabled:opacity-50"
          >
            {loading ? '...' : 'Guardar'}
          </button>
          <button
            onClick={() => setEditing(false)}
            className="px-3 py-2 border border-gray-200 rounded-xl text-sm text-gray-500"
          >
            Cancelar
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <div>
            {telefono ? (
              <p className="text-sm font-medium text-gray-900">{telefono}</p>
            ) : (
              <p className="text-sm text-gray-400">Sin número registrado</p>
            )}
            <p className="text-xs text-gray-400 mt-0.5">
              {telefono ? 'Recibirás notificaciones en WhatsApp' : 'Agrega tu número para recibir notificaciones'}
            </p>
          </div>
          <button
            onClick={() => setEditing(true)}
            className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-all"
          >
            {telefono ? 'Editar' : 'Agregar'}
          </button>
        </div>
      )}
    </div>
  )
}

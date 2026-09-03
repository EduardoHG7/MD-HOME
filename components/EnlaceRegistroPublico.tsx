'use client'

import { useState } from 'react'

export function EnlaceRegistroPublico({ ruta, etiqueta }: { ruta: string; etiqueta: string }) {
  const [copiado, setCopiado] = useState(false)
  const url = typeof window !== 'undefined' ? `${window.location.origin}${ruta}` : ruta

  async function copiar() {
    try {
      await navigator.clipboard.writeText(url)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      setCopiado(false)
    }
  }

  return (
    <div className="card p-4 bg-blue-50 border-blue-100">
      <p className="text-sm font-semibold text-gray-900 mb-1">🔗 Enlace de registro público</p>
      <p className="text-gray-500 text-xs mb-3">
        Comparte este enlace para que {etiqueta} completen sus datos por su cuenta, sin necesidad de crear una cuenta.
      </p>
      <div className="flex items-center gap-2">
        <input readOnly value={url} onFocus={e => e.target.select()}
          className="input flex-1 text-xs bg-white" />
        <button type="button" onClick={copiar} className="btn-ghost shrink-0 text-sm">
          {copiado ? '✅ Copiado' : '📋 Copiar'}
        </button>
      </div>
    </div>
  )
}

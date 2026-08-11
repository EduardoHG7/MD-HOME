'use client'

import { useState } from 'react'

// Ahora sí es Client Component a propósito: solo recibe una URL (no el HTML
// de varios MB), así que no hay costo de serialización RSC — y necesitamos
// estado para el spinner mientras el iframe carga su propio documento.
export function ReporteFrame({ src }: { src: string }) {
  const [loaded, setLoaded] = useState(false)

  return (
    <div className="relative" style={{ height: 'calc(100vh - 8rem)' }}>
      {!loaded && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-center">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-gray-900" />
          <p className="text-gray-500 text-sm">Cargando reporte…</p>
        </div>
      )}
      <iframe
        src={src}
        title="Conciliación Showare vs Bancos"
        className="w-full h-full border-0 rounded-2xl"
        style={{ visibility: loaded ? 'visible' : 'hidden' }}
        onLoad={() => setLoaded(true)}
      />
    </div>
  )
}

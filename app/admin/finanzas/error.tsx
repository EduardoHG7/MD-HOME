'use client'

export default function ErrorFinanzas({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Finanzas</h1>
      <p className="text-red-600 font-medium">Ocurrió un error mostrando el reporte.</p>
      <p className="text-gray-500 text-sm mt-2 font-mono break-words">{error.message}</p>
      {error.digest && <p className="text-gray-400 text-xs mt-1">digest: {error.digest}</p>}
      <button onClick={reset} className="btn-primary mt-4 text-sm">Reintentar</button>
    </div>
  )
}

'use client'

import { useEffect, useRef, useState } from 'react'

export interface EventoDoc {
  id: string; tipo: string; nombre: string | null
  archivoPath: string; archivoNombre: string; createdAt: string
  subidoPor: { name: string | null; email: string }
}

export const TIPOS_DOC = [
  { value: 'CONTRATO', label: '📝 Contrato' },
  { value: 'SEGURO',   label: '🛡️ Seguro' },
  { value: 'FIANZA',   label: '🏦 Fianza' },
  { value: 'PERMISO',  label: '📋 Permiso' },
  { value: 'OTRO',     label: '📎 Otro' },
]

export const TIPO_DOC_LABELS: Record<string, string> = Object.fromEntries(
  TIPOS_DOC.map(t => [t.value, t.label])
)

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload  = () => resolve((reader.result as string).split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export function DocumentosEvento({ eventoId, puedeSubir }: { eventoId: string; puedeSubir: boolean }) {
  const [docs,      setDocs]      = useState<EventoDoc[]>([])
  const [loading,   setLoading]   = useState(true)
  const [tipo,      setTipo]      = useState('CONTRATO')
  const [nombre,    setNombre]    = useState('')
  const [archivo,   setArchivo]   = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error,     setError]     = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch(`/api/eventos/${eventoId}/documentos`)
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setDocs(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [eventoId])

  async function handleUpload() {
    if (!archivo) { setError('Selecciona un archivo'); return }
    setUploading(true); setError('')
    try {
      const base64 = await fileToBase64(archivo)
      const res = await fetch(`/api/eventos/${eventoId}/documentos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo, nombre: nombre || null, base64, mimeType: archivo.type, fileName: archivo.name }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Error al subir'); return }
      setDocs(prev => [data, ...prev])
      setArchivo(null); setNombre('')
    } catch {
      setError('Error de conexión')
    } finally { setUploading(false) }
  }

  async function handleDelete(documentoId: string) {
    if (!confirm('¿Eliminar este documento?')) return
    const res = await fetch(`/api/eventos/${eventoId}/documentos`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documentoId }),
    })
    if (res.ok) setDocs(prev => prev.filter(d => d.id !== documentoId))
  }

  return (
    <div className="space-y-4">
      {/* Subir documento */}
      {puedeSubir && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Subir documento</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Tipo *</label>
              <select className="input" value={tipo} onChange={e => setTipo(e.target.value)}>
                {TIPOS_DOC.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Nombre / nota (opcional)</label>
              <input className="input" placeholder="Ej: Contrato artista principal"
                value={nombre} onChange={e => setNombre(e.target.value)} />
            </div>
          </div>
          <div
            onClick={() => fileRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-4 cursor-pointer transition-all text-center ${
              archivo ? 'border-green-400 bg-green-50' : 'border-gray-300 hover:border-gray-400'
            }`}>
            {archivo ? (
              <div className="flex items-center justify-center gap-2 text-green-700 text-sm font-medium">
                <span>📎</span><span>{archivo.name}</span>
                <button type="button" onClick={e => { e.stopPropagation(); setArchivo(null) }}
                  className="text-red-400 hover:text-red-600 ml-2">✕</button>
              </div>
            ) : (
              <p className="text-gray-500 text-sm">📎 Haz clic para seleccionar (PDF, Word o imagen)</p>
            )}
          </div>
          <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) setArchivo(f); e.target.value = '' }} />
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button onClick={handleUpload} disabled={uploading || !archivo} className="btn-primary w-full text-sm">
            {uploading ? '📤 Subiendo...' : 'Subir documento'}
          </button>
        </div>
      )}

      {/* Lista */}
      {loading ? (
        <p className="text-gray-400 text-sm text-center py-4">Cargando documentos...</p>
      ) : docs.length === 0 ? (
        <p className="text-gray-400 text-sm text-center py-4">📂 No hay documentos subidos aún</p>
      ) : (
        <div className="space-y-2">
          {docs.map(doc => (
            <div key={doc.id} className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl px-4 py-3">
              <span className="text-lg shrink-0">{(TIPO_DOC_LABELS[doc.tipo] ?? '📎').split(' ')[0]}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {doc.nombre || (TIPO_DOC_LABELS[doc.tipo] ?? doc.tipo).replace(/^\S+\s/, '')}
                </p>
                <p className="text-xs text-gray-400 truncate">
                  {doc.archivoNombre} · {new Date(doc.createdAt).toLocaleDateString('es-PA')} · {doc.subidoPor.name ?? doc.subidoPor.email}
                </p>
              </div>
              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full shrink-0">
                {(TIPO_DOC_LABELS[doc.tipo] ?? doc.tipo).replace(/^\S+\s/, '')}
              </span>
              <a href={`/api/fotos?path=${encodeURIComponent(doc.archivoPath)}`} target="_blank" rel="noopener noreferrer"
                className="text-xs text-blue-500 hover:underline shrink-0">Ver</a>
              {puedeSubir && (
                <button onClick={() => handleDelete(doc.id)}
                  className="text-xs text-red-400 hover:text-red-600 shrink-0">✕</button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

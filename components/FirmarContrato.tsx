'use client'

import { useEffect, useRef, useState } from 'react'
import * as pdfjs from 'pdfjs-dist'

// Worker auto-empaquetado por webpack (Next 14). Se setea una sola vez.
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.js',
  import.meta.url,
).toString()

const ANCHO_RENDER = 620 // px a los que se renderiza cada página en el visor

interface Colocacion { pagina: number; xRatio: number; yRatio: number }

// Modal para que el gerente coloque su firma con un clic sobre el PDF y firme.
// La rúbrica lateral en cada página la agrega el servidor automáticamente.
export function FirmarContrato({ eventoId, pdfPath, onFirmado, onCerrar }: {
  eventoId: string
  pdfPath: string
  onFirmado: (contrato: unknown) => void
  onCerrar: () => void
}) {
  const contRef = useRef<HTMLDivElement>(null)
  const [numPaginas, setNumPaginas] = useState(0)
  const [colocacion, setColocacion] = useState<Colocacion | null>(null)
  const [cargando,   setCargando]   = useState(true)
  const [firmando,   setFirmando]   = useState(false)
  const [error,      setError]      = useState('')

  // Renderiza todas las páginas del PDF en canvases apilados
  useEffect(() => {
    let cancelado = false
    const cont = contRef.current
    if (!cont) return

    ;(async () => {
      try {
        const url = `/api/fotos?path=${encodeURIComponent(pdfPath)}`
        const doc = await pdfjs.getDocument({ url }).promise
        if (cancelado) return
        setNumPaginas(doc.numPages)
        cont.innerHTML = ''

        for (let n = 1; n <= doc.numPages; n++) {
          const page     = await doc.getPage(n)
          const base     = page.getViewport({ scale: 1 })
          const scale    = ANCHO_RENDER / base.width
          const viewport = page.getViewport({ scale })

          const wrap = document.createElement('div')
          wrap.style.position = 'relative'
          wrap.style.margin   = '0 auto 14px'
          wrap.style.width    = `${viewport.width}px`
          wrap.style.cursor   = 'crosshair'
          wrap.dataset.pagina = String(n - 1) // 0-based para el servidor

          const canvas = document.createElement('canvas')
          canvas.width  = viewport.width
          canvas.height = viewport.height
          canvas.style.display    = 'block'
          canvas.style.boxShadow  = '0 1px 6px rgba(0,0,0,0.15)'
          canvas.style.borderRadius = '4px'
          wrap.appendChild(canvas)

          const ctx = canvas.getContext('2d')!
          await page.render({ canvasContext: ctx, viewport }).promise
          if (cancelado) return
          cont.appendChild(wrap)
        }
        setCargando(false)
      } catch (e) {
        if (!cancelado) {
          setError('No se pudo cargar el PDF en el visor. Verifica que el archivo sea un PDF válido.')
          setCargando(false)
        }
      }
    })()

    return () => { cancelado = true }
  }, [pdfPath])

  // Clic sobre una página → guarda (pagina, xRatio, yRatio) y pinta un marcador
  function onClickVisor(e: React.MouseEvent<HTMLDivElement>) {
    const wrap = (e.target as HTMLElement).closest('[data-pagina]') as HTMLElement | null
    if (!wrap) return
    const rect   = wrap.getBoundingClientRect()
    const xRatio = (e.clientX - rect.left) / rect.width
    const yRatio = (e.clientY - rect.top)  / rect.height
    const pagina = Number(wrap.dataset.pagina)

    // Quitar marcador previo (en cualquier página) y pintar el nuevo
    contRef.current?.querySelectorAll('[data-marcador]').forEach(m => m.remove())
    const dot = document.createElement('div')
    dot.dataset.marcador = '1'
    dot.style.cssText = `position:absolute;left:${xRatio * 100}%;top:${yRatio * 100}%;` +
      'transform:translate(-50%,-50%);width:118px;height:46px;margin:0;' +
      'border:2px dashed #2563eb;background:rgba(37,99,235,0.10);border-radius:6px;' +
      'pointer-events:none;display:flex;align-items:center;justify-content:center;' +
      'color:#2563eb;font-size:11px;font-weight:700;'
    dot.textContent = 'FIRMA AQUÍ'
    wrap.appendChild(dot)

    setColocacion({ pagina, xRatio, yRatio })
  }

  async function firmar() {
    if (!colocacion) return
    setFirmando(true); setError('')
    try {
      const res  = await fetch(`/api/eventos/${eventoId}/contrato/firmar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(colocacion),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Error al firmar'); return }
      onFirmado(data)
    } catch {
      setError('Error de conexión')
    } finally { setFirmando(false) }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex flex-col" onClick={onCerrar}>
      <div className="bg-white w-full max-w-3xl mx-auto my-4 rounded-2xl flex flex-col overflow-hidden"
        style={{ maxHeight: 'calc(100vh - 2rem)' }} onClick={e => e.stopPropagation()}>

        {/* Encabezado */}
        <div className="px-5 py-4 border-b flex items-center justify-between shrink-0">
          <div>
            <p className="font-bold text-gray-900">✍️ Firmar contrato</p>
            <p className="text-xs text-gray-500 mt-0.5">
              {cargando ? 'Cargando PDF…'
                : colocacion
                  ? `Firma en la página ${colocacion.pagina + 1}. Puedes hacer clic de nuevo para reubicar.`
                  : `Haz clic sobre el PDF donde va tu firma (bloque final). La rúbrica lateral se agrega sola en las ${numPaginas} páginas.`}
            </p>
          </div>
          <button onClick={onCerrar} className="text-gray-400 hover:text-gray-700 text-xl leading-none">✕</button>
        </div>

        {/* Visor */}
        <div className="flex-1 overflow-y-auto bg-gray-100 p-4" onClick={onClickVisor}>
          {cargando && <p className="text-center text-gray-400 py-10">Renderizando páginas…</p>}
          <div ref={contRef} />
        </div>

        {/* Pie */}
        <div className="px-5 py-4 border-t flex items-center gap-3 shrink-0">
          <button onClick={firmar} disabled={!colocacion || firmando} className="btn-primary text-sm">
            {firmando ? '✍️ Firmando…' : '✍️ Firmar aquí'}
          </button>
          <button onClick={onCerrar} className="text-sm text-gray-500 hover:text-gray-800">Cancelar</button>
          {error && <span className="text-sm text-red-500">{error}</span>}
        </div>
      </div>
    </div>
  )
}

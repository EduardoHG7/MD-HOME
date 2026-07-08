'use client'

import { useEffect, useRef, useState } from 'react'

// Pad para dibujar y guardar la firma del gerente (se estampa en los contratos)
export function FirmaPad() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dibujando = useRef(false)
  const trazo     = useRef(false)
  const [firmaGuardada, setFirmaGuardada] = useState<string | null>(null)
  const [guardando,     setGuardando]     = useState(false)
  const [mensaje,       setMensaje]       = useState('')

  useEffect(() => {
    fetch('/api/usuarios/firma')
      .then(r => r.json())
      .then(d => setFirmaGuardada(d.firmaImagen ?? null))
      .catch(() => {})
  }, [])

  function ctx() {
    const canvas = canvasRef.current
    if (!canvas) return null
    const c = canvas.getContext('2d')
    if (c) {
      c.lineWidth   = 2.5
      c.lineCap     = 'round'
      c.lineJoin    = 'round'
      c.strokeStyle = '#1a1a2e'
    }
    return c
  }

  function pos(e: React.MouseEvent | React.TouchEvent) {
    const canvas = canvasRef.current!
    const rect   = canvas.getBoundingClientRect()
    const punto  = 'touches' in e ? e.touches[0] : e
    return {
      x: (punto.clientX - rect.left) * (canvas.width / rect.width),
      y: (punto.clientY - rect.top) * (canvas.height / rect.height),
    }
  }

  function empezar(e: React.MouseEvent | React.TouchEvent) {
    const c = ctx()
    if (!c) return
    dibujando.current = true
    const { x, y } = pos(e)
    c.beginPath()
    c.moveTo(x, y)
  }

  function mover(e: React.MouseEvent | React.TouchEvent) {
    if (!dibujando.current) return
    const c = ctx()
    if (!c) return
    const { x, y } = pos(e)
    c.lineTo(x, y)
    c.stroke()
    trazo.current = true
  }

  function terminar() { dibujando.current = false }

  function limpiar() {
    const canvas = canvasRef.current
    const c = ctx()
    if (canvas && c) c.clearRect(0, 0, canvas.width, canvas.height)
    trazo.current = false
    setMensaje('')
  }

  async function guardar() {
    if (!trazo.current) { setMensaje('Dibuja tu firma primero'); return }
    setGuardando(true); setMensaje('')
    try {
      const firmaImagen = canvasRef.current!.toDataURL('image/png')
      const res  = await fetch('/api/usuarios/firma', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firmaImagen }),
      })
      const data = await res.json()
      if (!res.ok) { setMensaje(data.error ?? 'Error al guardar'); return }
      setFirmaGuardada(firmaImagen)
      setMensaje('✅ Firma guardada')
      limpiar()
    } catch {
      setMensaje('Error de conexión')
    } finally { setGuardando(false) }
  }

  return (
    <div className="space-y-3">
      {firmaGuardada && (
        <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-2">
          <span className="text-xs text-green-700 font-medium">Firma registrada:</span>
          <img src={firmaGuardada} alt="Firma" className="h-10 object-contain" />
        </div>
      )}
      <canvas
        ref={canvasRef}
        width={500}
        height={180}
        className="w-full bg-white border-2 border-dashed border-gray-300 rounded-xl cursor-crosshair touch-none"
        onMouseDown={empezar} onMouseMove={mover} onMouseUp={terminar} onMouseLeave={terminar}
        onTouchStart={empezar} onTouchMove={mover} onTouchEnd={terminar}
      />
      <div className="flex items-center gap-3">
        <button onClick={guardar} disabled={guardando} className="btn-primary text-sm">
          {guardando ? 'Guardando...' : '💾 Guardar firma'}
        </button>
        <button onClick={limpiar} className="text-sm text-gray-500 hover:text-gray-800">Limpiar</button>
        {mensaje && <span className="text-sm text-gray-600">{mensaje}</span>}
      </div>
      <p className="text-xs text-gray-400">
        Dibuja tu firma con el mouse o el dedo. Se estampará en los contratos que firmes.
      </p>
    </div>
  )
}

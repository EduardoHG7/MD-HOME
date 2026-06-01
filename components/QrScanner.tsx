'use client'

import { useEffect, useRef } from 'react'

interface Props {
  onResult: (text: string) => void
  onClose:  () => void
}

export default function QrScanner({ onResult, onClose }: Props) {
  const scannerRef = useRef<{ stop: () => Promise<void> } | null>(null)
  const started    = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true

    import('html5-qrcode').then(({ Html5Qrcode }) => {
      const qr = new Html5Qrcode('qr-video')

      // Obtener cámaras y abrir la trasera directamente
      Html5Qrcode.getCameras()
        .then(cameras => {
          if (!cameras?.length) return

          // Preferir cámara trasera
          const back = cameras.find(c =>
            /back|rear|environment/i.test(c.label)
          ) ?? cameras[cameras.length - 1]

          return qr.start(
            back.id,
            { fps: 15, qrbox: { width: 240, height: 240 } },
            (text: string) => {
              qr.stop().catch(() => {})
              onResult(text)
            },
            () => {},
          )
        })
        .catch(() => {
          // Fallback: usar constraint de environment directamente
          qr.start(
            { facingMode: 'environment' },
            { fps: 15, qrbox: { width: 240, height: 240 } },
            (text: string) => {
              qr.stop().catch(() => {})
              onResult(text)
            },
            () => {},
          ).catch(() => {})
        })

      scannerRef.current = qr
    })

    return () => {
      scannerRef.current?.stop().catch(() => {})
    }
  }, [onResult])

  return (
    <div
      className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl overflow-hidden w-full max-w-sm shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-bold text-gray-900">📷 Escanear QR de asistencia</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100"
          >
            ✕
          </button>
        </div>

        {/* Visor de cámara */}
        <div className="relative bg-black">
          <div id="qr-video" className="w-full" />
          {/* Marco de escaneo */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-52 h-52 border-2 border-white/60 rounded-xl relative">
              <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-white rounded-tl-lg" />
              <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-white rounded-tr-lg" />
              <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-white rounded-bl-lg" />
              <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-white rounded-br-lg" />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 text-center">
          <p className="text-gray-500 text-sm">Apunta al código QR del aplicante</p>
          <button
            onClick={onClose}
            className="mt-3 text-sm text-gray-400 hover:text-red-500 transition-colors"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}

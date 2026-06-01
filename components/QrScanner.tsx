'use client'

import { useEffect, useRef } from 'react'

interface Props {
  onResult: (text: string) => void
  onClose:  () => void
}

export default function QrScanner({ onResult, onClose }: Props) {
  const scannerRef = useRef<{ clear: () => Promise<void> } | null>(null)

  useEffect(() => {
    let mounted = true

    import('html5-qrcode').then(({ Html5QrcodeScanner }) => {
      if (!mounted) return

      const scanner = new Html5QrcodeScanner(
        'qr-reader',
        { fps: 10, qrbox: { width: 250, height: 250 }, rememberLastUsedCamera: true },
        false,
      )

      scanner.render(
        (text: string) => {
          scanner.clear().catch(() => {})
          onResult(text)
        },
        () => {},
      )

      scannerRef.current = scanner
    })

    return () => {
      mounted = false
      scannerRef.current?.clear().catch(() => {})
    }
  }, [onResult])

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-5 w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-bold text-gray-900">📷 Escanear QR</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>
        <div id="qr-reader" className="overflow-hidden rounded-xl" />
        <p className="text-center text-gray-400 text-xs mt-3">
          Apunta la cámara al código QR del aplicante
        </p>
      </div>
    </div>
  )
}

'use client'

import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

export type BoletoData = {
  id: string
  nombre?: string | null
  apellido?: string | null
  evento?: string | null
  fecha?: string | null
  codigo?: string | null
  extra?: Record<string, string>
}

// Tarjeta pensada para impresoras de tarjetas/credenciales tipo CR80
// (85.6mm x 54mm, apaisada). El tamaño real de impresión lo define el
// @page en globals.css / la página del kiosko; aquí solo se define el
// layout visual dentro de esas dimensiones.
export default function TicketCard({ boleto }: { boleto: BoletoData }) {
  const [qr, setQr] = useState<string | null>(null)

  useEffect(() => {
    if (!boleto.codigo) {
      setQr(null)
      return
    }
    QRCode.toDataURL(boleto.codigo, { margin: 0, width: 200 })
      .then(setQr)
      .catch(() => setQr(null))
  }, [boleto.codigo])

  const nombreCompleto = [boleto.nombre, boleto.apellido].filter(Boolean).join(' ') || 'Sin nombre'
  const extraEntries = Object.entries(boleto.extra ?? {}).filter(([, v]) => v)

  return (
    <div
      id="ticket-card"
      style={{
        width: '85.6mm',
        height: '54mm',
        boxSizing: 'border-box',
        padding: '3mm',
        background: 'white',
        color: '#111',
        display: 'flex',
        flexDirection: 'row',
        gap: '3mm',
        fontFamily: 'Arial, Helvetica, sans-serif',
        overflow: 'hidden',
      }}
    >
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minWidth: 0 }}>
        <div>
          <p style={{ fontSize: '7pt', letterSpacing: '0.5px', textTransform: 'uppercase', color: '#666', margin: 0 }}>
            {boleto.evento || 'Evento'}
          </p>
          <p style={{ fontSize: '13pt', fontWeight: 700, margin: '2mm 0 0 0', lineHeight: 1.1, wordBreak: 'break-word' }}>
            {nombreCompleto}
          </p>
        </div>
        <div>
          {boleto.fecha && <p style={{ fontSize: '8pt', margin: 0, color: '#333' }}>{boleto.fecha}</p>}
          {extraEntries.slice(0, 2).map(([k, v]) => (
            <p key={k} style={{ fontSize: '7pt', margin: 0, color: '#666' }}>
              {k}: {v}
            </p>
          ))}
        </div>
      </div>
      {qr && (
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <img src={qr} alt="" width="120" height="120" style={{ width: '20mm', height: '20mm' }} />
        </div>
      )}
    </div>
  )
}

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import TicketCard, { BoletoData } from '@/components/TicketCard'

type HistItem = BoletoData & { estado: string; createdAt: string }

export default function PuntoKioskPage({ params }: { params: { token: string } }) {
  const { token } = params
  const [puntoNombre, setPuntoNombre] = useState('')
  const [connected, setConnected] = useState(false)
  const [notFound, setNotFound] = useState(false)
  const [historial, setHistorial] = useState<HistItem[]>([])
  const [current, setCurrent] = useState<BoletoData | null>(null)

  const queueRef = useRef<BoletoData[]>([])
  const printingRef = useRef(false)

  const ack = useCallback(
    (id: string) => {
      fetch(`/api/stream/${token}/ack`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      }).catch(() => {})
    },
    [token]
  )

  const processQueue = useCallback(() => {
    if (printingRef.current) return
    const next = queueRef.current.shift()
    if (!next) return
    printingRef.current = true
    setCurrent(next)

    // Deja que React pinte la tarjeta antes de disparar la impresión.
    setTimeout(() => {
      const onAfterPrint = () => {
        window.removeEventListener('afterprint', onAfterPrint)
        ack(next.id)
        setHistorial((h) => [{ ...next, estado: 'IMPRESO', createdAt: new Date().toISOString() }, ...h].slice(0, 20))
        setCurrent(null)
        printingRef.current = false
        // Sigue con el siguiente boleto en cola, si hay.
        setTimeout(processQueue, 200)
      }
      window.addEventListener('afterprint', onAfterPrint)
      window.print()
    }, 150)
  }, [ack])

  useEffect(() => {
    let cancelled = false
    fetch(`/api/punto-info/${token}`)
      .then((res) => {
        if (!res.ok) throw new Error('not found')
        return res.json()
      })
      .then((data) => {
        if (cancelled) return
        setPuntoNombre(data.nombre)
        setHistorial(data.boletos)
      })
      .catch(() => {
        if (!cancelled) setNotFound(true)
      })
    return () => {
      cancelled = true
    }
  }, [token])

  useEffect(() => {
    if (notFound) return
    const es = new EventSource(`/api/stream/${token}`)
    es.addEventListener('ready', () => setConnected(true))
    es.addEventListener('boleto', (ev) => {
      const data = JSON.parse((ev as MessageEvent).data) as BoletoData
      queueRef.current.push(data)
      processQueue()
    })
    es.onerror = () => setConnected(false)
    es.onopen = () => setConnected(true)
    return () => es.close()
  }, [token, notFound, processQueue])

  function reimprimir(item: BoletoData) {
    queueRef.current.push(item)
    processQueue()
  }

  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center text-center px-4">
        <p className="text-red-400 text-lg">Este punto de impresión no existe o fue desactivado.</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col">
      <style>{`
        #ticket-print-area { position: absolute; top: -9999px; left: -9999px; }
        @media print {
          @page { size: 85.6mm 54mm; margin: 0; }
          body * { visibility: hidden; }
          #ticket-print-area, #ticket-print-area * { visibility: visible; }
          #ticket-print-area { position: fixed; top: 0; left: 0; }
        }
      `}</style>

      <header className="no-print border-b border-white/10 px-6 py-3 flex items-center justify-between">
        <span className="font-semibold text-white">{puntoNombre || 'Punto de impresión'}</span>
        <span className="flex items-center gap-2 text-sm text-gray-400">
          <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`} />
          {connected ? 'Conectado' : 'Reconectando…'}
        </span>
      </header>

      <main className="no-print flex-1 flex flex-col items-center justify-center gap-4 px-6">
        <div className="text-center">
          <p className="text-2xl text-gray-300">
            {current ? 'Imprimiendo boleto…' : 'Esperando boletos para imprimir…'}
          </p>
          <p className="text-sm text-gray-500 mt-1">Deja esta pantalla abierta en pantalla completa.</p>
        </div>
      </main>

      {historial.length > 0 && (
        <section className="no-print border-t border-white/10 px-6 py-4 max-h-56 overflow-auto">
          <p className="text-xs text-gray-500 mb-2">Últimos boletos</p>
          <ul className="space-y-1">
            {historial.map((h) => (
              <li key={h.id + h.createdAt} className="flex items-center justify-between text-sm text-gray-300">
                <span>
                  {[h.nombre, h.apellido].filter(Boolean).join(' ') || 'Sin nombre'}
                  {h.evento ? ` — ${h.evento}` : ''}
                </span>
                <button onClick={() => reimprimir(h)} className="text-brand-400 hover:text-brand-300 text-xs">
                  Reimprimir
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div id="ticket-print-area">{current && <TicketCard boleto={current} />}</div>
    </div>
  )
}

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { subscribe } from '@/lib/events'

// Server-Sent Events: la pantalla de un punto de impresión abre esta
// conexión y se queda escuchando; cada boleto válido que llega por el
// webhook se empuja aquí en tiempo real.
export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  const punto = await prisma.punto.findUnique({ where: { token: params.token } })
  if (!punto || !punto.activo) {
    return new Response('Punto no encontrado o inactivo', { status: 404 })
  }

  const encoder = new TextEncoder()
  let unsubscribe: (() => void) | undefined
  let keepAlive: ReturnType<typeof setInterval> | undefined

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
      }

      send('ready', { punto: punto.nombre })

      unsubscribe = subscribe(params.token, (data) => send('boleto', data))

      keepAlive = setInterval(() => {
        controller.enqueue(encoder.encode(': keep-alive\n\n'))
      }, 25000)
    },
    cancel() {
      unsubscribe?.()
      if (keepAlive) clearInterval(keepAlive)
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}

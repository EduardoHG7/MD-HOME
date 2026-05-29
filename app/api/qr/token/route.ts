import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { generateQRToken, secondsUntilRefresh } from '@/lib/qr-token'
import QRCode from 'qrcode'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const aplicanteId = searchParams.get('aid')
  const eventoId    = searchParams.get('eid')

  if (!aplicanteId || !eventoId) {
    return NextResponse.json({ error: 'Parámetros faltantes' }, { status: 400 })
  }

  // Verify assignment exists
  const asignacion = await prisma.asignacionAplicante.findUnique({
    where: { aplicanteId_eventoId: { aplicanteId, eventoId } },
    include: { aplicante: { select: { qrSecret: true } } },
  })
  if (!asignacion) {
    return NextResponse.json({ error: 'Sin asignación' }, { status: 404 })
  }

  const secret = `${asignacion.aplicante.qrSecret}-${eventoId}`
  const token  = generateQRToken(secret)
  const ttl    = secondsUntilRefresh()

  const baseUrl = process.env.NEXTAUTH_URL ?? 'http://localhost:3000'
  const url = `${baseUrl}/api/asistencia/scan?aid=${aplicanteId}&eid=${eventoId}&t=${token}`

  const qrDataUrl = await QRCode.toDataURL(url, {
    width: 300,
    margin: 2,
    color: { dark: '#1e0553', light: '#ffffff' },
    errorCorrectionLevel: 'H',
  })

  return NextResponse.json({ qr: qrDataUrl, ttl, token })
}

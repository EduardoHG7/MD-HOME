export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { parseIncomingPayload, ingestScan } from '@/lib/ingest'

// URL que se configura en CodeREADr (Postback URL / Post-Scan Submit) para
// un punto de impresión específico. Acepta tanto GET (query params) como
// POST (JSON o form-urlencoded), porque distintas configuraciones de
// CodeREADr pueden mandar el resultado de una forma u otra.
async function handle(req: NextRequest, token: string) {
  const punto = await prisma.punto.findUnique({ where: { token } })
  if (!punto || !punto.activo) {
    return new NextResponse('Punto no encontrado o inactivo', { status: 404 })
  }

  const payload = await parseIncomingPayload(req)
  await ingestScan(punto.id, punto.token, payload)

  // CodeREADr no requiere un formato de respuesta especial para un
  // Postback/Post-Scan Submit normal; un 200 OK es suficiente.
  return new NextResponse('OK', { status: 200 })
}

export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  return handle(req, params.token)
}

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  return handle(req, params.token)
}

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// La pantalla del punto llama esto justo después de imprimir un boleto,
// para marcarlo como IMPRESO en el historial.
export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const punto = await prisma.punto.findUnique({ where: { token: params.token } })
  if (!punto) return new NextResponse('Punto no encontrado', { status: 404 })

  const { id } = await req.json().catch(() => ({ id: undefined }))
  if (!id) return new NextResponse('Falta id', { status: 400 })

  const boleto = await prisma.boleto.findUnique({ where: { id } })
  if (!boleto || boleto.puntoId !== punto.id) {
    return new NextResponse('Boleto no encontrado', { status: 404 })
  }

  await prisma.boleto.update({
    where: { id },
    data: { estado: 'IMPRESO', printedAt: new Date() },
  })

  return NextResponse.json({ ok: true })
}

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const puntos = await prisma.punto.findMany({
    orderBy: { createdAt: 'asc' },
    include: { _count: { select: { boletos: true } } },
  })
  return NextResponse.json(puntos)
}

export async function POST(req: NextRequest) {
  const { nombre } = await req.json().catch(() => ({ nombre: '' }))
  if (!nombre || typeof nombre !== 'string' || !nombre.trim()) {
    return new NextResponse('El nombre es requerido', { status: 400 })
  }

  const token = randomBytes(24).toString('base64url')
  const punto = await prisma.punto.create({
    data: { nombre: nombre.trim(), token },
  })

  return NextResponse.json(punto, { status: 201 })
}

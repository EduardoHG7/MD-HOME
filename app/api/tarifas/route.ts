export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const tarifas = await prisma.tarifa.findMany({ orderBy: { tipo: 'asc' } })
  return NextResponse.json(tarifas)
}

export async function PUT(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { tipo, precioPorDia } = await req.json()

  const tarifa = await prisma.tarifa.upsert({
    where: { tipo },
    update: { precioPorDia },
    create: { tipo, precioPorDia },
  })

  return NextResponse.json(tarifa)
}

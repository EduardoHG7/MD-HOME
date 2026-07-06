export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const eventos = await prisma.evento.findMany({
    where: {
      docsResponsableId: session.user.id,
      estado: { not: 'CANCELADO' },
    },
    select: {
      id: true, nombre: true, fechaInicio: true, fechaFin: true, estado: true,
      documentos: {
        include: { subidoPor: { select: { name: true, email: true } } },
        orderBy: { createdAt: 'desc' },
      },
    },
    orderBy: { fechaInicio: 'desc' },
  })

  return NextResponse.json(eventos)
}

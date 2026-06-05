export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const lineas = await prisma.presupuestoLinea.findMany({
    where: { asignadoAId: session.user.id },
    include: {
      categoria: {
        include: {
          presupuesto: {
            include: { evento: { select: { id: true, nombre: true, fechaInicio: true, fechaFin: true, estado: true } } }
          }
        }
      },
      cotizaciones: {
        include: { facturas: true },
        orderBy: { createdAt: 'desc' },
      },
    },
    orderBy: { orden: 'asc' },
  })

  return NextResponse.json(lineas)
}

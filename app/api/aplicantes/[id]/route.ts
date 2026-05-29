import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const aplicante = await prisma.aplicante.findUnique({
    where: { id: params.id },
    include: {
      asignaciones: {
        include: {
          evento: true,
          registros: { orderBy: { timestamp: 'asc' } },
        },
      },
    },
  })
  if (!aplicante) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  // Never expose qrSecret to client
  const { qrSecret: _, ...safe } = aplicante
  return NextResponse.json(safe)
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const data = await req.json()
  const aplicante = await prisma.aplicante.update({ where: { id: params.id }, data })
  return NextResponse.json(aplicante)
}

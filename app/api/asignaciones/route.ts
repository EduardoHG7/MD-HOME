import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { aplicanteId, eventoId, solicitudId, funcion } = await req.json()

  const asignacion = await prisma.asignacionAplicante.upsert({
    where: { aplicanteId_eventoId: { aplicanteId, eventoId } },
    update: { funcion, estado: 'ACTIVA' },
    create: { aplicanteId, eventoId, solicitudId, funcion },
  })
  return NextResponse.json(asignacion, { status: 201 })
}

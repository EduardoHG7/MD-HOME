export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const where = session.user.role === 'ADMIN' ? {} : { solicitanteId: session.user.id }

  const solicitudes = await prisma.solicitud.findMany({
    where,
    include: {
      evento: true,
      solicitante: { select: { name: true, email: true } },
      tarifa: true,
      asignaciones: {
        include: { aplicante: { select: { id: true, nombreCompleto: true, cedula: true, telefono: true } } },
        where: { estado: 'ACTIVA' },
      },
    },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(solicitudes)
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { eventoId, numPersonas, funcion } = await req.json()

  if (!eventoId || !numPersonas || !funcion) {
    return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 })
  }

  const solicitud = await prisma.solicitud.create({
    data: {
      eventoId,
      solicitanteId: session.user.id,
      numPersonas,
      funcion,
    },
    include: { evento: true, tarifa: true },
  })
  return NextResponse.json(solicitud, { status: 201 })
}

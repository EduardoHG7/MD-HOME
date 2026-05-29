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
    },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(solicitudes)
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { eventoId, numPersonas, funcion, tipoTarifa } = await req.json()

  const tarifa = await prisma.tarifa.findUnique({ where: { tipo: tipoTarifa } })
  if (!tarifa) return NextResponse.json({ error: 'Tarifa no encontrada' }, { status: 400 })

  const solicitud = await prisma.solicitud.create({
    data: {
      eventoId,
      solicitanteId: session.user.id,
      tarifaId: tarifa.id,
      numPersonas,
      funcion,
    },
    include: { evento: true, tarifa: true },
  })
  return NextResponse.json(solicitud, { status: 201 })
}

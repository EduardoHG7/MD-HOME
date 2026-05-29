import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const eventos = await prisma.evento.findMany({
    where: { estado: { not: 'CANCELADO' } },
    orderBy: { fechaInicio: 'desc' },
    include: {
      _count: { select: { asignaciones: true } },
    },
  })
  return NextResponse.json(eventos)
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { nombre, descripcion, fechaInicio, fechaFin } = await req.json()

  const evento = await prisma.evento.create({
    data: { nombre, descripcion, fechaInicio: new Date(fechaInicio), fechaFin: new Date(fechaFin) },
  })
  return NextResponse.json(evento, { status: 201 })
}

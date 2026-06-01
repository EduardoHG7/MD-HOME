export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { aplicanteId, eventoId, solicitudId, funcion } = await req.json()

  // Si no es admin, verificar que la solicitud sea propia y esté aprobada
  if (session.user.role !== 'ADMIN') {
    const solicitud = await prisma.solicitud.findUnique({ where: { id: solicitudId } })
    if (!solicitud) return NextResponse.json({ error: 'Solicitud no encontrada' }, { status: 404 })
    if (solicitud.solicitanteId !== session.user.id) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }
    if (solicitud.estado !== 'APROBADA') {
      return NextResponse.json({ error: 'La solicitud debe estar aprobada' }, { status: 400 })
    }
  }

  const asignacion = await prisma.asignacionAplicante.upsert({
    where: { aplicanteId_eventoId: { aplicanteId, eventoId } },
    update: { funcion, estado: 'ACTIVA', solicitudId },
    create: { aplicanteId, eventoId, solicitudId, funcion },
    include: { aplicante: { select: { id: true, nombreCompleto: true, cedula: true, telefono: true } } },
  })

  return NextResponse.json(asignacion, { status: 201 })
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { asignacionId, solicitudId } = await req.json()

  // Si no es admin, verificar que la solicitud sea propia
  if (session.user.role !== 'ADMIN') {
    const solicitud = await prisma.solicitud.findUnique({ where: { id: solicitudId } })
    if (!solicitud || solicitud.solicitanteId !== session.user.id) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }
  }

  await prisma.asignacionAplicante.delete({ where: { id: asignacionId } })
  return NextResponse.json({ ok: true })
}

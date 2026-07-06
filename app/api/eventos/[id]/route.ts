export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const evento = await prisma.evento.findUnique({
    where: { id: params.id },
    select: { id: true, nombre: true, tipoEvento: true, estado: true },
  })
  if (!evento) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  return NextResponse.json(evento)
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { nombre, descripcion, fechaInicio, fechaFin, estado, tipoEvento, venueId, tieneSocio, nombreSocio, montajeInicio, desmontajeFin } = await req.json()

  const evento = await prisma.evento.update({
    where: { id: params.id },
    data: {
      ...(nombre      !== undefined && { nombre }),
      ...(descripcion !== undefined && { descripcion }),
      ...(fechaInicio !== undefined && { fechaInicio: new Date(fechaInicio) }),
      ...(fechaFin    !== undefined && { fechaFin:    new Date(fechaFin) }),
      ...(estado      !== undefined && { estado }),
      ...(tipoEvento  !== undefined && { tipoEvento: tipoEvento || null }),
      ...(venueId     !== undefined && { venueId: venueId || null }),
      ...(tieneSocio  !== undefined && { tieneSocio }),
      ...(nombreSocio !== undefined && { nombreSocio: tieneSocio ? (nombreSocio || null) : null }),
      ...(montajeInicio !== undefined && { montajeInicio: montajeInicio ? new Date(montajeInicio) : null }),
      ...(desmontajeFin !== undefined && { desmontajeFin: desmontajeFin ? new Date(desmontajeFin) : null }),
    },
    include: { _count: { select: { asignaciones: true } }, venue: true },
  })

  return NextResponse.json(evento)
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  await prisma.evento.update({
    where: { id: params.id },
    data: { estado: 'CANCELADO' },
  })

  return NextResponse.json({ ok: true })
}


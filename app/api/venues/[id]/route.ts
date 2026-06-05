export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const { nombre, direccion, activo } = await req.json()
  const venue = await prisma.venue.update({
    where: { id: params.id },
    data: {
      ...(nombre    !== undefined && { nombre }),
      ...(direccion !== undefined && { direccion }),
      ...(activo    !== undefined && { activo }),
    },
  })
  return NextResponse.json(venue)
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  // Soft delete
  await prisma.venue.update({ where: { id: params.id }, data: { activo: false } })
  return NextResponse.json({ ok: true })
}

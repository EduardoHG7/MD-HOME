export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// PATCH: aprobar/rechazar (admin) o editar (dueño si PENDIENTE)
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { estado, notaAdmin } = await req.json()

  if (session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Solo admins pueden aprobar/rechazar' }, { status: 403 })
  }

  const cot = await prisma.cotizacion.update({
    where: { id: params.id },
    data:  { estado, notaAdmin: notaAdmin ?? null },
    include: { facturas: true, creadoPor: { select: { name: true, email: true } } },
  })
  return NextResponse.json(cot)
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const cot = await prisma.cotizacion.findUnique({ where: { id: params.id } })
  if (!cot) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })
  if (cot.creadoPorId !== session.user.id && session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }
  if (cot.estado !== 'PENDIENTE') {
    return NextResponse.json({ error: 'Solo se pueden eliminar cotizaciones pendientes' }, { status: 400 })
  }

  await prisma.cotizacion.delete({ where: { id: params.id } })
  return NextResponse.json({ ok: true })
}

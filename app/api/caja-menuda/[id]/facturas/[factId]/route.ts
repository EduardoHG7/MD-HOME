export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function DELETE(_req: Request, { params }: { params: { id: string; factId: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const caja = await prisma.cajaMenuda.findUnique({ where: { id: params.id } })
  if (!caja) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })
  if (caja.solicitanteId !== session.user.id && session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }
  if (caja.estado === 'PAGADA') {
    return NextResponse.json({ error: 'No se pueden eliminar facturas de una caja menuda pagada' }, { status: 400 })
  }

  await prisma.facturaCajaMenuda.delete({ where: { id: params.factId } })
  return NextResponse.json({ ok: true })
}

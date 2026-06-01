export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const factura = await prisma.factura.findUnique({ where: { id: params.id } })
  if (!factura) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })

  // Solo admin o el creador pueden eliminar
  if (session.user.role !== 'ADMIN' && factura.creadoPorId !== session.user.id) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  await prisma.factura.delete({ where: { id: params.id } })
  return NextResponse.json({ ok: true })
}

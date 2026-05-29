import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { estado, costoTotal, notaAdmin } = await req.json()

  const solicitud = await prisma.solicitud.update({
    where: { id: params.id },
    data: { estado, costoTotal, notaAdmin },
    include: { evento: true, tarifa: true },
  })
  return NextResponse.json(solicitud)
}

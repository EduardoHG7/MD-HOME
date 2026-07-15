export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { puedeGestionarExpediente } from '@/lib/expediente-permisos'

// Marcar si el documento de logística aplica o no al evento (Panatickets)
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  if (!(await puedeGestionarExpediente(params.id, session.user.id, session.user.role, session.user.email))) {
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
  }

  const { aplica } = await req.json()
  if (typeof aplica !== 'boolean') {
    return NextResponse.json({ error: 'aplica debe ser true o false' }, { status: 400 })
  }

  const evento = await prisma.evento.update({
    where: { id: params.id },
    data: { logisticaAplica: aplica },
    select: { logisticaAplica: true },
  })
  return NextResponse.json(evento)
}

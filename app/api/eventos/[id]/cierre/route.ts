export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// Comentario y aprobación del cierre — solo admin
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Solo el administrador puede gestionar el cierre' }, { status: 403 })
  }

  const body = await req.json()
  const data: {
    cierreComentario?: string | null
    cierreAprobado?: boolean
    cierreAprobadoPor?: string | null
    cierreAprobadoEn?: Date | null
  } = {}

  if ('comentario' in body) {
    data.cierreComentario = body.comentario ? String(body.comentario) : null
  }
  if (typeof body.aprobado === 'boolean') {
    data.cierreAprobado = body.aprobado
    if (body.aprobado) {
      data.cierreAprobadoPor = session.user.name ?? session.user.email ?? 'Admin'
      data.cierreAprobadoEn  = new Date()
    } else {
      data.cierreAprobadoPor = null
      data.cierreAprobadoEn   = null
    }
  }

  const evento = await prisma.evento.update({
    where: { id: params.id },
    data,
    select: {
      cierreComentario: true, cierreAprobado: true,
      cierreAprobadoPor: true, cierreAprobadoEn: true,
    },
  })
  return NextResponse.json(evento)
}

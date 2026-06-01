export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const q        = searchParams.get('q')?.trim() ?? ''
  const eventoId = searchParams.get('eventoId') ?? ''

  const aplicantes = await prisma.aplicante.findMany({
    where: {
      activo: true,
      ...(q ? {
        OR: [
          { nombreCompleto: { contains: q, mode: 'insensitive' } },
          { cedula:         { contains: q, mode: 'insensitive' } },
        ],
      } : {}),
    },
    select: {
      id:             true,
      nombreCompleto: true,
      cedula:         true,
      telefono:       true,
      asignaciones: {
        where: { eventoId: eventoId || '__ninguno__' },
        select: { id: true },
      },
    },
    orderBy: { nombreCompleto: 'asc' },
    take: 50,
  })

  return NextResponse.json(aplicantes)
}

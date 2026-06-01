export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// Retorna aplicantes activos para que usuarios puedan asignarlos a sus solicitudes aprobadas
export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const q       = searchParams.get('q')?.toLowerCase() ?? ''
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
      // Verificar si ya está asignado al evento
      asignaciones: eventoId
        ? { where: { eventoId }, select: { id: true } }
        : false,
    },
    orderBy: { nombreCompleto: 'asc' },
    take: 50,
  })

  return NextResponse.json(aplicantes)
}

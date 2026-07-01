export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const user = await prisma.user.findUnique({
    where: { id: params.id },
    select: { id: true, name: true, email: true, role: true, telefono: true, createdAt: true },
  })
  if (!user) return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })

  const [solicitudes, cotizaciones, cajasMenuda] = await Promise.all([
    prisma.solicitud.findMany({
      where: { solicitanteId: params.id },
      include: {
        evento:      true,
        tarifa:      true,
        aprobadoPor: { select: { name: true, email: true } },
        asignaciones: {
          include: {
            aplicante: { select: { id: true, nombreCompleto: true, cedula: true, telefono: true } },
            registros: { orderBy: { timestamp: 'asc' } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),

    prisma.cotizacion.findMany({
      where: { creadoPorId: params.id },
      include: {
        facturas:    true,
        creadoPor:   { select: { name: true, email: true } },
        aprobadaPor: { select: { name: true, email: true } },
        linea: {
          include: {
            categoria: {
              include: { presupuesto: { include: { evento: { select: { nombre: true } } } } },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),

    prisma.cajaMenuda.findMany({
      where: { solicitanteId: params.id },
      include: {
        evento:      { select: { nombre: true } },
        aprobadoPor: { select: { name: true, email: true } },
        pagadoPor:   { select: { name: true, email: true } },
        facturas:    true,
      },
      orderBy: { createdAt: 'desc' },
    }),
  ])

  return NextResponse.json({ user, solicitudes, cotizaciones, cajasMenuda })
}

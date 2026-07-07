export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getActiveTenantId } from '@/lib/tenant'

export async function GET() {
  const tenantId = getActiveTenantId()

  const venues = await prisma.venue.findMany({
    where: { activo: true, ...(tenantId ? { tenantId } : {}) },
    orderBy: { nombre: 'asc' },
    include: {
      eventos: {
        where: {
          estado: { not: 'CANCELADO' },
          ...(tenantId ? { tenantId } : {}),
        },
        select: { id: true, nombre: true, fechaInicio: true, fechaFin: true, estado: true },
        orderBy: { fechaInicio: 'desc' },
      },
    },
  })
  return NextResponse.json(venues)
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const tenantId = getActiveTenantId()
  const { nombre, direccion } = await req.json()
  if (!nombre?.trim()) return NextResponse.json({ error: 'Nombre requerido' }, { status: 400 })

  const venue = await prisma.venue.create({
    data: { nombre: nombre.trim(), direccion: direccion?.trim() || null, tenantId: tenantId ?? null },
  })
  return NextResponse.json(venue, { status: 201 })
}

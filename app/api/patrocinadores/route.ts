export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getActiveTenantId } from '@/lib/tenant'

export async function GET() {
  const tenantId = getActiveTenantId()

  const patrocinadores = await prisma.patrocinador.findMany({
    where: { activo: true, ...(tenantId ? { tenantId } : {}) },
    orderBy: { nombre: 'asc' },
    include: {
      patrocinios: {
        include: {
          presupuesto: {
            include: { evento: { select: { nombre: true, fechaInicio: true } } },
          },
        },
      },
    },
  })
  return NextResponse.json(patrocinadores)
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const tenantId = getActiveTenantId()
  const { nombre, categoria } = await req.json()
  if (!nombre?.trim()) return NextResponse.json({ error: 'Nombre requerido' }, { status: 400 })

  const p = await prisma.patrocinador.create({
    data: { nombre: nombre.trim(), categoria: categoria || null, tenantId: tenantId ?? null },
  })
  return NextResponse.json(p, { status: 201 })
}

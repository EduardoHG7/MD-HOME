export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getActiveTenantId } from '@/lib/tenant'

export async function GET() {
  const tenantId = getActiveTenantId()
  if (!tenantId) return NextResponse.json([])

  const propias = await prisma.tarifa.findMany({
    where: { tenantId },
    orderBy: { tipo: 'asc' },
  })
  if (propias.length) return NextResponse.json(propias)

  // La empresa activa todavía no definió sus propias tarifas — se usan los
  // valores por defecto (sembrados sin empresa) hasta que las configure en
  // Tarifas.
  const globales = await prisma.tarifa.findMany({
    where: { tenantId: null },
    orderBy: { tipo: 'asc' },
  })
  return NextResponse.json(globales)
}

export async function PUT(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const tenantId = getActiveTenantId()
  const { tipo, precioPorDia } = await req.json()

  const existing = await prisma.tarifa.findFirst({
    where: { tipo, tenantId: tenantId ?? null },
  })

  const tarifa = existing
    ? await prisma.tarifa.update({ where: { id: existing.id }, data: { precioPorDia } })
    : await prisma.tarifa.create({ data: { tipo, precioPorDia, tenantId: tenantId ?? null } })

  return NextResponse.json(tarifa)
}

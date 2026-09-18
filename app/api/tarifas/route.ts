export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getActiveTenantId } from '@/lib/tenant'
import { tarifasParaTenant } from '@/lib/tarifas'

export async function GET() {
  const tenantId = getActiveTenantId()
  if (!tenantId) return NextResponse.json([])

  try {
    const tarifas = await tarifasParaTenant(tenantId)
    return NextResponse.json(tarifas)
  } catch (err) {
    console.error('[tarifas] Error obteniendo/creando tarifas:', err)
    const detalle = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `Error al cargar tarifas: ${detalle}` }, { status: 500 })
  }
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

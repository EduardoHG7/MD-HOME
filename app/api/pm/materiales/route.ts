export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getActiveTenantId } from '@/lib/tenant'

// Catálogo de materiales del cotizador — exclusivo del tenant "printmediapty".
const TENANT_SLUG = 'printmediapty'

async function tenantAutorizado() {
  const tenantId = getActiveTenantId()
  const tenant = tenantId ? await prisma.tenant.findUnique({ where: { id: tenantId } }) : null
  return tenant?.slug === TENANT_SLUG ? tenantId : null
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const tenantId = await tenantAutorizado()
  if (!tenantId) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const materiales = await prisma.materialPM.findMany({
    where: { activo: true, tenantId },
    orderBy: { nombre: 'asc' },
  })
  return NextResponse.json(materiales)
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const tenantId = await tenantAutorizado()
  if (!tenantId) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const { nombre, unidad, costoUnitario } = await req.json()
  if (!nombre?.trim() || !unidad?.trim()) {
    return NextResponse.json({ error: 'Nombre y unidad son requeridos' }, { status: 400 })
  }

  const material = await prisma.materialPM.create({
    data: { tenantId, nombre: nombre.trim(), unidad: unidad.trim(), costoUnitario: Number(costoUnitario) || 0 },
  })
  return NextResponse.json(material, { status: 201 })
}

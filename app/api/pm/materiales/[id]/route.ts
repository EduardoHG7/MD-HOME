export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getActiveTenantId } from '@/lib/tenant'

const TENANT_SLUG = 'printmediapty'

async function tenantAutorizado() {
  const tenantId = getActiveTenantId()
  const tenant = tenantId ? await prisma.tenant.findUnique({ where: { id: tenantId } }) : null
  return tenant?.slug === TENANT_SLUG ? tenantId : null
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  if (!(await tenantAutorizado())) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const { nombre, unidad, costoUnitario } = await req.json()
  const material = await prisma.materialPM.update({
    where: { id: params.id },
    data: {
      ...(nombre        !== undefined ? { nombre: String(nombre).trim() } : {}),
      ...(unidad        !== undefined ? { unidad: String(unidad).trim() } : {}),
      ...(costoUnitario !== undefined ? { costoUnitario: Number(costoUnitario) || 0 } : {}),
    },
  })
  return NextResponse.json(material)
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  if (!(await tenantAutorizado())) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  await prisma.materialPM.update({ where: { id: params.id }, data: { activo: false } })
  return NextResponse.json({ ok: true })
}

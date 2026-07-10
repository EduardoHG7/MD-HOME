export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getActiveTenantId } from '@/lib/tenant'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  // En Panatickets la documentación la suben los usuarios: si la empresa activa
  // es Panatickets y el usuario pertenece a ella, ve TODOS los eventos de la
  // empresa. En las demás empresas solo ve los eventos donde es responsable.
  const tenantId = getActiveTenantId()
  let panatickets = false
  if (tenantId) {
    const ut = await prisma.userTenant.findUnique({
      where: { userId_tenantId: { userId: session.user.id, tenantId } },
      include: { tenant: { select: { slug: true } } },
    })
    panatickets = ut?.tenant.slug === 'panatickets'
  }

  const eventos = await prisma.evento.findMany({
    where: panatickets
      ? { estado: { not: 'CANCELADO' }, tenants: { some: { tenantId: tenantId! } } }
      : { docsResponsableId: session.user.id, estado: { not: 'CANCELADO' } },
    select: {
      id: true, nombre: true, fechaInicio: true, fechaFin: true, estado: true,
      documentos: {
        include: { subidoPor: { select: { name: true, email: true } } },
        orderBy: { createdAt: 'desc' },
      },
    },
    orderBy: { fechaInicio: 'desc' },
  })

  return NextResponse.json({ panatickets, eventos })
}

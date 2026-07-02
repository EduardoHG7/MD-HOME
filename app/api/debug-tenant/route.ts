export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const cookieStore = cookies()
  const activeTenantId = cookieStore.get('active_tenant_id')?.value ?? null

  const tenant = activeTenantId
    ? await prisma.tenant.findUnique({ where: { id: activeTenantId } })
    : null

  const eventosCount = await prisma.evento.count({
    where: activeTenantId ? { tenantId: activeTenantId } : {},
  })

  const eventosTotal = await prisma.evento.count()

  const allCookies = cookieStore.getAll().map(c => ({ name: c.name, value: c.value.slice(0, 20) }))

  return NextResponse.json({
    activeTenantId,
    tenant,
    eventosEnEsteTenant: eventosCount,
    eventosTotal,
    allCookies,
  })
}

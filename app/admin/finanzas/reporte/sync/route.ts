export const dynamic = 'force-dynamic'
export const maxDuration = 300

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getActiveTenantId } from '@/lib/tenant'
import { prisma } from '@/lib/prisma'
import { syncFinanzasPanatickets } from '@/lib/panatickets-finanzas'

// Botón "Actualizar ahora" del reporte — mismo trabajo que hace el cron
// (descargar Excel de SharePoint, sincronizar a Postgres), pero disparado a
// mano por un admin en vez de esperar al horario programado.
export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const tenantId = getActiveTenantId()
  const tenant = tenantId ? await prisma.tenant.findUnique({ where: { id: tenantId } }) : null
  if (tenant?.slug !== 'panatickets') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  try {
    const resultado = await syncFinanzasPanatickets()
    return NextResponse.json({ ok: true, ...resultado })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

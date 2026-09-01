export const dynamic = 'force-dynamic'
export const maxDuration = 300

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getActiveTenantId } from '@/lib/tenant'
import { prisma } from '@/lib/prisma'
import { puedeVerFinanzas } from '@/lib/permisos'
import { syncFinanzasPanatickets } from '@/lib/panatickets-finanzas'

// Botón "Actualizar ahora" del reporte — mismo trabajo que hace el cron
// (descargar Excel de SharePoint, sincronizar a Postgres), pero disparado a
// mano por quien tenga acceso al dashboard en vez de esperar al horario
// programado.
export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session || !puedeVerFinanzas(session.user)) {
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
    // Sin este log, un fallo acá no deja NINGÚN rastro en Vercel — la ruta
    // ya atrapa el error y responde 500 con el mensaje, pero eso solo llega
    // al navegador; los logs de la función quedan vacíos.
    console.error('[finanzas-panatickets] Error en sync:', e)
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

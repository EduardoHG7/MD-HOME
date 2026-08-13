export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getActiveTenantId } from '@/lib/tenant'
import { prisma } from '@/lib/prisma'
import { puedeVerFinanzas } from '@/lib/permisos'
import { getFinanzasPanaticketsRango } from '@/lib/panatickets-finanzas'

// Datos del reporte de Finanzas Panatickets por rango, consultados desde
// Postgres (sincronizado por el cron) en vez de reprocesar el Excel de
// SharePoint en cada carga. ?year=2026 o ?from=YYYY-MM-DD&to=YYYY-MM-DD;
// sin parámetros, el año en curso.
export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!puedeVerFinanzas(session.user)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const tenantId = getActiveTenantId()
  const tenant = tenantId ? await prisma.tenant.findUnique({ where: { id: tenantId } }) : null
  if (tenant?.slug !== 'panatickets') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const year = searchParams.get('year')
  const fromParam = searchParams.get('from')
  const toParam = searchParams.get('to')

  let desde: string
  let hasta: string
  if (fromParam && toParam) {
    desde = fromParam
    hasta = toParam
  } else {
    const anio = year && /^\d{4}$/.test(year) ? year : String(new Date().getUTCFullYear())
    desde = `${anio}-01-01`
    hasta = `${anio}-12-31`
  }

  try {
    const datos = await getFinanzasPanaticketsRango(desde, hasta)
    return NextResponse.json({ ...datos, desde, hasta })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

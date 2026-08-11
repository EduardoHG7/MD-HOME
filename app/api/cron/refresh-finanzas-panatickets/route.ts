export const dynamic = 'force-dynamic'
export const maxDuration = 300

import { NextResponse } from 'next/server'
import { syncFinanzasPanatickets } from '@/lib/panatickets-finanzas'

// Llamado por Vercel Cron para mantener Postgres al día con el Excel de
// Panatickets (bajar de SharePoint + parsear ~37 mil filas + upsert), así el
// dashboard nunca tiene que reprocesar el Excel en vivo — solo consulta
// Postgres por rango de fechas.
export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const start = Date.now()
  const resultado = await syncFinanzasPanatickets()
  return NextResponse.json({ ok: true, ms: Date.now() - start, ...resultado })
}

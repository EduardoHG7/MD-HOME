export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextResponse } from 'next/server'
import { getFinanzasPanatickets } from '@/lib/panatickets-finanzas'

// Llamado por Vercel Cron para mantener el caché de Finanzas Panatickets
// siempre tibio, así los usuarios casi nunca esperan el cálculo completo
// (bajar el Excel de SharePoint + parsear ~37 mil filas).
export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const start = Date.now()
  await getFinanzasPanatickets()
  return NextResponse.json({ ok: true, ms: Date.now() - start })
}

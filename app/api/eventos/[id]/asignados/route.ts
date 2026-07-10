export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getConsolidadoAsignados } from '@/lib/asignados'

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role === 'APLICANTE') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const data = await getConsolidadoAsignados(params.id)
  if (!data) return NextResponse.json({ error: 'Evento no encontrado' }, { status: 404 })
  return NextResponse.json(data)
}

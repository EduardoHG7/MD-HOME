export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { proximoTipoRegistro } from '@/lib/asistencia'

async function loadAsignacionActiva(eventoId: string) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'APLICANTE') {
    return { error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) } as const
  }

  const asignacion = await prisma.asignacionAplicante.findUnique({
    where: { aplicanteId_eventoId: { aplicanteId: session.user.id, eventoId } },
    include: { evento: true },
  })
  if (!asignacion || asignacion.estado !== 'ACTIVA') {
    return { error: NextResponse.json({ error: 'Sin asignación activa' }, { status: 404 }) } as const
  }

  return { asignacion } as const
}

// Estado actual de la jornada: qué tipo de registro corresponde marcar ahora.
export async function GET(req: NextRequest) {
  const eventoId = new URL(req.url).searchParams.get('eventoId')
  if (!eventoId) return NextResponse.json({ error: 'Falta eventoId' }, { status: 400 })

  const result = await loadAsignacionActiva(eventoId)
  if ('error' in result) return result.error

  const tipo = await proximoTipoRegistro(result.asignacion.id)
  return NextResponse.json({ tipo })
}

// Autorregistro de entrada/salida del propio aplicante.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { eventoId, lat, lng } = body as { eventoId?: string; lat?: number; lng?: number }
  if (!eventoId) return NextResponse.json({ error: 'Falta eventoId' }, { status: 400 })

  const result = await loadAsignacionActiva(eventoId)
  if ('error' in result) return result.error

  const tipo = await proximoTipoRegistro(result.asignacion.id)
  if (!tipo) return NextResponse.json({ error: 'Ya registraste entrada y salida hoy' }, { status: 409 })

  const registro = await prisma.registroAsistencia.create({
    data: {
      asignacionId: result.asignacion.id,
      tipo,
      tokenUsado: `self-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      origen: 'SELF',
      lat: typeof lat === 'number' ? lat : null,
      lng: typeof lng === 'number' ? lng : null,
    },
  })

  return NextResponse.json({ tipo, timestamp: registro.timestamp })
}

export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { RolAprobacion } from '@/lib/aprobaciones'

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.isSuperAdmin) {
    return NextResponse.json({ error: 'Solo super-admin' }, { status: 403 })
  }

  const tenantId = new URL(req.url).searchParams.get('tenantId')
  if (!tenantId) return NextResponse.json({ error: 'Falta tenantId' }, { status: 400 })

  const config = await prisma.aprobacionConfig.findUnique({
    where: { tenantId },
    include: { usuarios: { select: { userId: true, rol: true } } },
  })

  const porRol = (rol: RolAprobacion) => config?.usuarios.filter(u => u.rol === rol).map(u => u.userId) ?? []

  return NextResponse.json({
    receptoresSolicitud: porRol('RECEPTOR_SOLICITUD'),
    aprobadores:         porRol('APROBADOR'),
    receptoresRespuesta: porRol('RECEPTOR_RESPUESTA'),
  })
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.isSuperAdmin) {
    return NextResponse.json({ error: 'Solo super-admin' }, { status: 403 })
  }

  const { tenantId, receptoresSolicitud, aprobadores, receptoresRespuesta } = await req.json() as {
    tenantId: string
    receptoresSolicitud: string[]
    aprobadores: string[]
    receptoresRespuesta: string[]
  }
  if (!tenantId) return NextResponse.json({ error: 'Falta tenantId' }, { status: 400 })

  const filas: { userId: string; rol: RolAprobacion }[] = [
    ...(receptoresSolicitud ?? []).map(userId => ({ userId, rol: 'RECEPTOR_SOLICITUD' as const })),
    ...(aprobadores ?? []).map(userId => ({ userId, rol: 'APROBADOR' as const })),
    ...(receptoresRespuesta ?? []).map(userId => ({ userId, rol: 'RECEPTOR_RESPUESTA' as const })),
  ]

  const config = await prisma.aprobacionConfig.upsert({
    where: { tenantId },
    create: { tenantId, usuarios: { create: filas } },
    update: { usuarios: { deleteMany: {}, create: filas } },
  })

  return NextResponse.json({ ok: true, configId: config.id })
}

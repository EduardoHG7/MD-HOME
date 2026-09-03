export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => ({}))
  const data: { nombre?: string; activo?: boolean } = {}
  if (typeof body.nombre === 'string' && body.nombre.trim()) data.nombre = body.nombre.trim()
  if (typeof body.activo === 'boolean') data.activo = body.activo

  const punto = await prisma.punto.update({ where: { id: params.id }, data })
  return NextResponse.json(punto)
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  await prisma.punto.delete({ where: { id: params.id } })
  return NextResponse.json({ ok: true })
}

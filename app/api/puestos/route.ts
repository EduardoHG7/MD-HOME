export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getActiveTenantId } from '@/lib/tenant'

export async function GET() {
  const tenantId = getActiveTenantId()

  const puestos = await prisma.puesto.findMany({
    where: { activo: true, ...(tenantId ? { tenantId } : {}) },
    orderBy: { nombre: 'asc' },
  })
  return NextResponse.json(puestos)
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const tenantId = getActiveTenantId()
  const { nombre } = await req.json()
  if (!nombre?.trim()) {
    return NextResponse.json({ error: 'El nombre es requerido' }, { status: 400 })
  }

  const existing = await prisma.puesto.findFirst({
    where: { nombre: nombre.trim(), tenantId: tenantId ?? null },
  })

  const puesto = existing
    ? await prisma.puesto.update({ where: { id: existing.id }, data: { activo: true } })
    : await prisma.puesto.create({ data: { nombre: nombre.trim(), tenantId: tenantId ?? null } })

  return NextResponse.json(puesto, { status: 201 })
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { id } = await req.json()
  await prisma.puesto.update({ where: { id }, data: { activo: false } })
  return NextResponse.json({ ok: true })
}

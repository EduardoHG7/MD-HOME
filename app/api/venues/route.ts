export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const venues = await prisma.venue.findMany({
    where: { activo: true },
    orderBy: { nombre: 'asc' },
  })
  return NextResponse.json(venues)
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const { nombre, direccion } = await req.json()
  if (!nombre?.trim()) return NextResponse.json({ error: 'Nombre requerido' }, { status: 400 })

  const venue = await prisma.venue.create({ data: { nombre: nombre.trim(), direccion: direccion?.trim() || null } })
  return NextResponse.json(venue, { status: 201 })
}

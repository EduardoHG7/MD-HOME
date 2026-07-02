export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.isSuperAdmin) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const tenants = await prisma.tenant.findMany({
    orderBy: { createdAt: 'asc' },
    include: {
      usuarios: {
        include: { user: { select: { id: true, name: true, email: true } } },
      },
    },
  })
  return NextResponse.json(tenants)
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.isSuperAdmin) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { nombre, slug, logo } = await req.json()
  if (!nombre || !slug) return NextResponse.json({ error: 'nombre y slug requeridos' }, { status: 400 })

  const tenant = await prisma.tenant.create({ data: { nombre, slug, logo } })
  return NextResponse.json(tenant)
}

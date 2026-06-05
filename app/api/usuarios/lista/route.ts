export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const usuarios = await prisma.user.findMany({
    where: { role: { in: ['USER', 'ADMIN'] } },
    select: { id: true, name: true, email: true, role: true },
    orderBy: { name: 'asc' },
  })
  return NextResponse.json(usuarios)
}

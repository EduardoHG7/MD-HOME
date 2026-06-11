export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { telefono } = await req.json()

  const user = await prisma.user.update({
    where: { id: session.user.id },
    data: { telefono: telefono?.trim() || null },
    select: { telefono: true },
  })

  return NextResponse.json(user)
}

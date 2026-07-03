export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.isSuperAdmin) {
    return NextResponse.json({ error: 'Solo super-admin' }, { status: 403 })
  }

  const users = await prisma.user.findMany({
    where: {
      role: { not: 'APLICANTE' },
      tenants: { none: {} },
    },
    select: { id: true, name: true, email: true, role: true },
    orderBy: { email: 'asc' },
  })

  return NextResponse.json(users)
}

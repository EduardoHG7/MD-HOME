export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const tenants = await prisma.tenant.findMany({
    where: { activo: true },
    select: { id: true, nombre: true, logo: true, slug: true },
    orderBy: { nombre: 'asc' },
  })
  return NextResponse.json(tenants)
}

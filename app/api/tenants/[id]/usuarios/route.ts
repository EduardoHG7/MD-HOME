import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// Assign user to tenant with a role
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.isSuperAdmin) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { userId, role } = await req.json()
  if (!userId) return NextResponse.json({ error: 'userId requerido' }, { status: 400 })

  const ut = await prisma.userTenant.upsert({
    where:  { userId_tenantId: { userId, tenantId: params.id } },
    update: { role: role ?? 'USER' },
    create: { userId, tenantId: params.id, role: role ?? 'USER' },
  })
  return NextResponse.json(ut)
}

// Remove user from tenant
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.isSuperAdmin) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { userId } = await req.json()
  await prisma.userTenant.deleteMany({
    where: { tenantId: params.id, userId },
  })
  return NextResponse.json({ ok: true })
}

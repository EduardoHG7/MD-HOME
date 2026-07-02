import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// One-time endpoint to create the initial tenants and assign Eduardo as super-admin.
// Protected: only works if you're authenticated as the ADMIN_EMAIL.
export async function POST() {
  const session = await getServerSession(authOptions)
  const adminEmail = process.env.ADMIN_EMAIL

  if (!session?.user?.email || session.user.email !== adminEmail) {
    return NextResponse.json({ error: 'Solo el super-admin puede hacer esto' }, { status: 403 })
  }

  // Create tenants
  const md = await prisma.tenant.upsert({
    where:  { slug: 'magic-dreams' },
    update: {},
    create: { nombre: 'Magic Dreams Productions', slug: 'magic-dreams', logo: '/logo.png' },
  })

  const pt = await prisma.tenant.upsert({
    where:  { slug: 'panatickets' },
    update: {},
    create: { nombre: 'PanaTickets', slug: 'panatickets', logo: '/logo-panatickets.png' },
  })

  // Mark Eduardo as super-admin and assign to both tenants
  const admin = await prisma.user.upsert({
    where:  { email: adminEmail },
    update: { isSuperAdmin: true, role: 'ADMIN' },
    create: { email: adminEmail, role: 'ADMIN', isSuperAdmin: true },
  })

  await prisma.userTenant.upsert({
    where:  { userId_tenantId: { userId: admin.id, tenantId: md.id } },
    update: { role: 'ADMIN' },
    create: { userId: admin.id, tenantId: md.id, role: 'ADMIN' },
  })

  await prisma.userTenant.upsert({
    where:  { userId_tenantId: { userId: admin.id, tenantId: pt.id } },
    update: { role: 'ADMIN' },
    create: { userId: admin.id, tenantId: pt.id, role: 'ADMIN' },
  })

  return NextResponse.json({
    ok: true,
    tenants: [
      { slug: md.slug, nombre: md.nombre },
      { slug: pt.slug, nombre: pt.nombre },
    ],
    superAdmin: admin.email,
  })
}

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

  const TENANTS = [
    { nombre: 'Magic Dreams Productions', slug: 'magic-dreams',    logo: '/logo.png' },
    { nombre: 'Panatickets',              slug: 'panatickets',     logo: '/logo_panatickets.png' },
    { nombre: 'Master Events PTY',        slug: 'mastereventspty', logo: '/logo_masterevents.png' },
    { nombre: 'Print Media PTY',          slug: 'printmediapty',   logo: '/logo_printmedia.png' },
  ]

  const createdTenants = []
  for (const t of TENANTS) {
    const tenant = await prisma.tenant.upsert({
      where:  { slug: t.slug },
      update: { nombre: t.nombre, logo: t.logo },
      create: t,
    })
    createdTenants.push(tenant)
  }

  // Mark Eduardo as super-admin and assign to all tenants
  const admin = await prisma.user.upsert({
    where:  { email: adminEmail },
    update: { isSuperAdmin: true, role: 'ADMIN' },
    create: { email: adminEmail, role: 'ADMIN', isSuperAdmin: true },
  })

  for (const tenant of createdTenants) {
    await prisma.userTenant.upsert({
      where:  { userId_tenantId: { userId: admin.id, tenantId: tenant.id } },
      update: { role: 'ADMIN' },
      create: { userId: admin.id, tenantId: tenant.id, role: 'ADMIN' },
    })
  }

  return NextResponse.json({
    ok: true,
    tenants: createdTenants.map(t => ({ slug: t.slug, nombre: t.nombre })),
    superAdmin: admin.email,
  })
}

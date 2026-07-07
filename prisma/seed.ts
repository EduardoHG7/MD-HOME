import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  // Seed tarifas (sin tenant — cada empresa define las suyas desde la app)
  const TARIFAS = [
    { tipo: 'DIARIA',    precioPorDia: 25 },
    { tipo: 'QUINCENAL', precioPorDia: 20 },
    { tipo: 'MENSUAL',   precioPorDia: 15 },
  ]
  for (const t of TARIFAS) {
    const existing = await prisma.tarifa.findFirst({ where: { tipo: t.tipo, tenantId: null } })
    if (!existing) await prisma.tarifa.create({ data: t })
  }
  console.log('✓ Tarifas inicializadas')

  // Seed tenants
  const mdTenant = await prisma.tenant.upsert({
    where:  { slug: 'magic-dreams' },
    update: {},
    create: { nombre: 'Magic Dreams Productions', slug: 'magic-dreams', logo: '/logo.png' },
  })
  const ptTenant = await prisma.tenant.upsert({
    where:  { slug: 'panatickets' },
    update: {},
    create: { nombre: 'Panatickets', slug: 'panatickets', logo: '/logo_panatickets.png' },
  })
  console.log('✓ Tenants creados:', mdTenant.slug, ptTenant.slug)

  // Make Eduardo super-admin and assign to both tenants
  const adminEmail = process.env.ADMIN_EMAIL
  if (adminEmail) {
    const admin = await prisma.user.upsert({
      where:  { email: adminEmail },
      update: { isSuperAdmin: true, role: 'ADMIN' },
      create: { email: adminEmail, role: 'ADMIN', isSuperAdmin: true },
    })
    await prisma.userTenant.upsert({
      where:  { userId_tenantId: { userId: admin.id, tenantId: mdTenant.id } },
      update: { role: 'ADMIN' },
      create: { userId: admin.id, tenantId: mdTenant.id, role: 'ADMIN' },
    })
    await prisma.userTenant.upsert({
      where:  { userId_tenantId: { userId: admin.id, tenantId: ptTenant.id } },
      update: { role: 'ADMIN' },
      create: { userId: admin.id, tenantId: ptTenant.id, role: 'ADMIN' },
    })
    console.log('✓ Super-admin asignado a ambos tenants')
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())

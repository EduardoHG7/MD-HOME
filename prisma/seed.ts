import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  // Seed tarifas
  await prisma.tarifa.upsert({ where: { tipo: 'DIARIA' },    update: {}, create: { tipo: 'DIARIA',    precioPorDia: 25 } })
  await prisma.tarifa.upsert({ where: { tipo: 'QUINCENAL' }, update: {}, create: { tipo: 'QUINCENAL', precioPorDia: 20 } })
  await prisma.tarifa.upsert({ where: { tipo: 'MENSUAL' },   update: {}, create: { tipo: 'MENSUAL',   precioPorDia: 15 } })
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
    create: { nombre: 'PanaTickets', slug: 'panatickets', logo: '/logo-panatickets.png' },
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

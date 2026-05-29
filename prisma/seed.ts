import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  // Seed tarifas
  await prisma.tarifa.upsert({ where: { tipo: 'DIARIA' },    update: {}, create: { tipo: 'DIARIA',    precioPorDia: 25 } })
  await prisma.tarifa.upsert({ where: { tipo: 'QUINCENAL' }, update: {}, create: { tipo: 'QUINCENAL', precioPorDia: 20 } })
  await prisma.tarifa.upsert({ where: { tipo: 'MENSUAL' },   update: {}, create: { tipo: 'MENSUAL',   precioPorDia: 15 } })

  console.log('✓ Tarifas inicializadas: Diaria $25 | Quincenal $20 | Mensual $15')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())

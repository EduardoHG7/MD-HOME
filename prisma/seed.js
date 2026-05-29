const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  await prisma.tarifa.upsert({ where: { tipo: 'DIARIA' },    update: { precioPorDia: 25 }, create: { tipo: 'DIARIA',    precioPorDia: 25 } })
  await prisma.tarifa.upsert({ where: { tipo: 'QUINCENAL' }, update: { precioPorDia: 20 }, create: { tipo: 'QUINCENAL', precioPorDia: 20 } })
  await prisma.tarifa.upsert({ where: { tipo: 'MENSUAL' },   update: { precioPorDia: 15 }, create: { tipo: 'MENSUAL',   precioPorDia: 15 } })
  console.log('✓ Tarifas inicializadas: Diaria $25 | Quincenal $20 | Mensual $15')
}

main().catch(console.error).finally(() => prisma.$disconnect())

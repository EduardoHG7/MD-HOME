import { prisma } from './prisma'

// Mismos valores que prisma/seed.ts — pero el seed es un script manual
// (npm run db:seed) que no corre solo en cada deploy, así que estos
// defaults también viven aquí para que siempre haya algo que elegir aunque
// nadie lo haya corrido nunca en este entorno.
const DEFAULTS = [
  { tipo: 'DIARIA',    precioPorDia: 25 },
  { tipo: 'QUINCENAL', precioPorDia: 20 },
  { tipo: 'MENSUAL',   precioPorDia: 15 },
]

async function tarifasGlobales() {
  const existentes = await prisma.tarifa.findMany({ where: { tenantId: null }, orderBy: { tipo: 'asc' } })
  if (existentes.length) return existentes

  for (const d of DEFAULTS) {
    const existe = await prisma.tarifa.findFirst({ where: { tipo: d.tipo, tenantId: null } })
    if (!existe) await prisma.tarifa.create({ data: d })
  }
  return prisma.tarifa.findMany({ where: { tenantId: null }, orderBy: { tipo: 'asc' } })
}

// Tarifas de la empresa activa — si todavía no definió las suyas, cae a
// las globales (creándolas con los valores por defecto si ni esas existen).
export async function tarifasParaTenant(tenantId: string) {
  const propias = await prisma.tarifa.findMany({ where: { tenantId }, orderBy: { tipo: 'asc' } })
  if (propias.length) return propias
  return tarifasGlobales()
}

// Una tarifa puntual por tipo, con el mismo fallback.
export async function tarifaParaTenant(tipo: string, tenantId: string) {
  const propia = await prisma.tarifa.findFirst({ where: { tipo, tenantId } })
  if (propia) return propia
  const globales = await tarifasGlobales()
  return globales.find(t => t.tipo === tipo) ?? null
}

export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getActiveTenantId } from '@/lib/tenant'

const TENANT_SLUG = 'printmediapty'

async function tenantAutorizado() {
  const tenantId = getActiveTenantId()
  const tenant = tenantId ? await prisma.tenant.findUnique({ where: { id: tenantId } }) : null
  return tenant?.slug === TENANT_SLUG ? tenantId : null
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const tenantId = await tenantAutorizado()
  if (!tenantId) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const productos = await prisma.productoParametricoPM.findMany({
    where: { activo: true, tenantId },
    include: { materiales: true },
    orderBy: { nombre: 'asc' },
  })
  return NextResponse.json(productos)
}

interface RecetaInput { materialId: string; cantidadPorM2?: number; cantidadPorMetroPerimetro?: number }

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const tenantId = await tenantAutorizado()
  if (!tenantId) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const { nombre, formula, manoObra, margenA, margenB, margenC, materiales } = await req.json()
  if (!nombre?.trim()) return NextResponse.json({ error: 'El nombre es requerido' }, { status: 400 })
  if (!['AREA', 'AREA_PERIMETRO'].includes(formula)) {
    return NextResponse.json({ error: 'Fórmula inválida' }, { status: 400 })
  }

  const producto = await prisma.productoParametricoPM.create({
    data: {
      tenantId,
      nombre: nombre.trim(),
      formula,
      manoObra: Number(manoObra) || 0,
      margenA: Number(margenA) || 0,
      margenB: Number(margenB) || 0,
      margenC: Number(margenC) || 0,
      materiales: {
        create: ((materiales ?? []) as RecetaInput[])
          .filter(m => m.materialId)
          .map(m => ({
            materialId: m.materialId,
            cantidadPorM2: Number(m.cantidadPorM2) || 0,
            cantidadPorMetroPerimetro: Number(m.cantidadPorMetroPerimetro) || 0,
          })),
      },
    },
    include: { materiales: true },
  })
  return NextResponse.json(producto, { status: 201 })
}

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

interface RecetaInput { materialId: string; cantidadPorM2?: number; cantidadPorMetroPerimetro?: number }

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  if (!(await tenantAutorizado())) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const { nombre, formula, manoObra, margenA, margenB, margenC, materiales } = await req.json()

  // Si vienen materiales, se reemplaza toda la receta (borra y vuelve a crear)
  if (Array.isArray(materiales)) {
    await prisma.productoMaterialPM.deleteMany({ where: { productoId: params.id } })
  }

  const producto = await prisma.productoParametricoPM.update({
    where: { id: params.id },
    data: {
      ...(nombre   !== undefined ? { nombre: String(nombre).trim() } : {}),
      ...(formula  !== undefined ? { formula } : {}),
      ...(manoObra !== undefined ? { manoObra: Number(manoObra) || 0 } : {}),
      ...(margenA  !== undefined ? { margenA: Number(margenA) || 0 } : {}),
      ...(margenB  !== undefined ? { margenB: Number(margenB) || 0 } : {}),
      ...(margenC  !== undefined ? { margenC: Number(margenC) || 0 } : {}),
      ...(Array.isArray(materiales) ? {
        materiales: {
          create: (materiales as RecetaInput[])
            .filter(m => m.materialId)
            .map(m => ({
              materialId: m.materialId,
              cantidadPorM2: Number(m.cantidadPorM2) || 0,
              cantidadPorMetroPerimetro: Number(m.cantidadPorMetroPerimetro) || 0,
            })),
        },
      } : {}),
    },
    include: { materiales: true },
  })
  return NextResponse.json(producto)
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  if (!(await tenantAutorizado())) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  await prisma.productoParametricoPM.update({ where: { id: params.id }, data: { activo: false } })
  return NextResponse.json({ ok: true })
}

export const dynamic = 'force-dynamic'
export const maxDuration = 30

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getActiveTenantId } from '@/lib/tenant'
import { calcularItem, calcularResumen, type ProductoCalc, type MaterialCalc, type NivelPrecio } from '@/lib/cotizadorPM'

const TENANT_SLUG = 'printmediapty'

async function tenantAutorizado() {
  const tenantId = getActiveTenantId()
  const tenant = tenantId ? await prisma.tenant.findUnique({ where: { id: tenantId } }) : null
  return tenant?.slug === TENANT_SLUG ? tenantId : null
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!(await tenantAutorizado())) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const cot = await prisma.cotizacionPM.findUnique({
    where: { id: params.id },
    include: {
      items: { orderBy: { orden: 'asc' } },
      evento: { select: { id: true, nombre: true } },
      creadoPor: { select: { name: true, email: true } },
      aprobadaPor: { select: { name: true, email: true } },
      facturasCostoReal: true,
    },
  })
  if (!cot) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })
  if (session.user.role !== 'ADMIN' && cot.creadoPorId !== session.user.id) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }
  return NextResponse.json(cot)
}

interface ItemInput {
  productoId?: string | null
  descripcion: string
  ancho?: number | null
  alto?: number | null
  cantidad?: number
  incluyeInstalacion?: boolean
  incluyeDiseno?: boolean
  incluido?: boolean
  costoUnitarioManual?: number
  precioUnitarioManual?: number
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const tenantId = await tenantAutorizado()
  if (!tenantId) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const existente = await prisma.cotizacionPM.findUnique({ where: { id: params.id } })
  if (!existente) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })
  if (session.user.role !== 'ADMIN' && existente.creadoPorId !== session.user.id) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }
  if (existente.estado !== 'PENDIENTE') {
    return NextResponse.json({ error: 'Solo se puede editar una cotización pendiente' }, { status: 400 })
  }

  const {
    nombreTrabajo, clienteId, clienteNombre, clienteContacto, clienteTelefono, clienteCorreo,
    nivelPrecio, eventoId, vigenciaDias, carpetaDriveUrl, notas,
    transporte, costosIndirectosPct, fechaEntrega, items,
  } = await req.json()

  const nivel: NivelPrecio = ['A', 'B', 'C'].includes(nivelPrecio) ? nivelPrecio : (existente.nivelPrecio as NivelPrecio)

  const [productos, materiales] = await Promise.all([
    prisma.productoParametricoPM.findMany({ where: { tenantId, activo: true }, include: { materiales: true } }),
    prisma.materialPM.findMany({ where: { tenantId, activo: true } }),
  ])
  const productosPorId: Record<string, ProductoCalc> = Object.fromEntries(
    productos.map(p => [p.id, {
      id: p.id, formula: p.formula as 'AREA' | 'AREA_PERIMETRO', manoObra: p.manoObra,
      margenA: p.margenA, margenB: p.margenB, margenC: p.margenC,
      materiales: p.materiales.map(m => ({
        materialId: m.materialId, cantidadPorM2: m.cantidadPorM2, cantidadPorMetroPerimetro: m.cantidadPorMetroPerimetro,
      })),
    }])
  )
  const materialesPorId: Record<string, MaterialCalc> = Object.fromEntries(
    materiales.map(m => [m.id, { id: m.id, costoUnitario: m.costoUnitario }])
  )

  const itemsCalculados = (items as ItemInput[]).map((it, idx) => {
    const cantidad = Math.max(1, Number(it.cantidad) || 1)
    const incluido = it.incluido !== false
    const { costoUnitario, precioUnitario } = calcularItem(
      { productoId: it.productoId, ancho: it.ancho, alto: it.alto, cantidad, incluido,
        costoUnitarioManual: it.costoUnitarioManual, precioUnitarioManual: it.precioUnitarioManual },
      nivel, productosPorId, materialesPorId,
    )
    return {
      productoId: it.productoId || null,
      descripcion: it.descripcion?.trim() || 'Ítem',
      ancho: it.ancho ?? null,
      alto: it.alto ?? null,
      cantidad,
      incluyeInstalacion: Boolean(it.incluyeInstalacion),
      incluyeDiseno: Boolean(it.incluyeDiseno),
      incluido,
      costoUnitario,
      precioUnitario,
      orden: idx,
    }
  })

  const resumen = calcularResumen(itemsCalculados, Number(transporte) || 0, Number(costosIndirectosPct) || 0)

  await prisma.itemCotizacionPM.deleteMany({ where: { cotizacionId: params.id } })

  const cot = await prisma.cotizacionPM.update({
    where: { id: params.id },
    data: {
      nombreTrabajo: nombreTrabajo?.trim() || existente.nombreTrabajo,
      clienteId: clienteId || null,
      clienteNombre: clienteNombre?.trim() || existente.clienteNombre,
      clienteContacto: clienteContacto?.trim() || null,
      clienteTelefono: clienteTelefono?.trim() || null,
      clienteCorreo: clienteCorreo?.trim() || null,
      nivelPrecio: nivel,
      eventoId: eventoId || null,
      vigenciaDias: Number(vigenciaDias) || existente.vigenciaDias,
      carpetaDriveUrl: carpetaDriveUrl?.trim() || null,
      notas: notas?.trim() || null,
      transporte: resumen.transporte,
      costosIndirectosPct: Number(costosIndirectosPct) || 0,
      fechaEntrega: fechaEntrega ? new Date(fechaEntrega) : null,
      montoVenta: resumen.montoVenta,
      costoTotal: resumen.costoTotal,
      utilidadBruta: resumen.utilidadBruta,
      items: { create: itemsCalculados },
    },
    include: { items: { orderBy: { orden: 'asc' } } },
  })
  return NextResponse.json(cot)
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!(await tenantAutorizado())) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const existente = await prisma.cotizacionPM.findUnique({ where: { id: params.id } })
  if (!existente) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })
  if (session.user.role !== 'ADMIN' && existente.creadoPorId !== session.user.id) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }
  if (existente.estado !== 'PENDIENTE') {
    return NextResponse.json({ error: 'Solo se puede eliminar una cotización pendiente' }, { status: 400 })
  }

  await prisma.cotizacionPM.delete({ where: { id: params.id } })
  return NextResponse.json({ ok: true })
}

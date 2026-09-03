export const dynamic = 'force-dynamic'
export const maxDuration = 30

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getActiveTenantId } from '@/lib/tenant'
import { sendMail, templateNuevaCotizacionPM } from '@/lib/mail'
import { calcularItem, calcularResumen, type ProductoCalc, type MaterialCalc, type NivelPrecio } from '@/lib/cotizadorPM'

const TENANT_SLUG = 'printmediapty'
const DOMINIO_ADMIN_PM = '@printmediapty.com'

async function tenantAutorizado() {
  const tenantId = getActiveTenantId()
  const tenant = tenantId ? await prisma.tenant.findUnique({ where: { id: tenantId } }) : null
  return tenant?.slug === TENANT_SLUG ? tenantId : null
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const tenantId = await tenantAutorizado()
  if (!tenantId) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const eventoId = new URL(req.url).searchParams.get('eventoId')

  const where = {
    ...(session.user.role === 'ADMIN' ? { tenantId } : { tenantId, creadoPorId: session.user.id }),
    ...(eventoId ? { eventoId } : {}),
  }

  const cotizaciones = await prisma.cotizacionPM.findMany({
    where,
    include: {
      items:     { orderBy: { orden: 'asc' } },
      evento:    { select: { id: true, nombre: true } },
      creadoPor: { select: { name: true, email: true } },
      aprobadaPor: { select: { name: true, email: true } },
      costoRealAprobadoPor: { select: { name: true, email: true } },
      facturasCostoReal: true,
    },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(cotizaciones)
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

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const tenantId = await tenantAutorizado()
  if (!tenantId) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const {
    nombreTrabajo, clienteId, clienteNombre, clienteContacto, clienteTelefono, clienteCorreo,
    nivelPrecio, eventoId, vigenciaDias, carpetaDriveUrl, notas,
    transporte, costosIndirectosPct, fechaEntrega, items,
  } = await req.json()

  if (!nombreTrabajo?.trim()) return NextResponse.json({ error: 'El nombre del trabajo es requerido' }, { status: 400 })
  if (!clienteNombre?.trim()) return NextResponse.json({ error: 'El cliente es requerido' }, { status: 400 })
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: 'Agrega al menos un ítem' }, { status: 400 })
  }
  const nivel: NivelPrecio = ['A', 'B', 'C'].includes(nivelPrecio) ? nivelPrecio : 'B'

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

  const cot = await prisma.cotizacionPM.create({
    data: {
      tenantId,
      nombreTrabajo: nombreTrabajo.trim(),
      clienteId: clienteId || null,
      clienteNombre: clienteNombre.trim(),
      clienteContacto: clienteContacto?.trim() || null,
      clienteTelefono: clienteTelefono?.trim() || null,
      clienteCorreo: clienteCorreo?.trim() || null,
      nivelPrecio: nivel,
      eventoId: eventoId || null,
      vigenciaDias: Number(vigenciaDias) || 15,
      carpetaDriveUrl: carpetaDriveUrl?.trim() || null,
      notas: notas?.trim() || null,
      transporte: resumen.transporte,
      costosIndirectosPct: Number(costosIndirectosPct) || 0,
      fechaEntrega: fechaEntrega ? new Date(fechaEntrega) : null,
      montoVenta: resumen.montoVenta,
      costoTotal: resumen.costoTotal,
      utilidadBruta: resumen.utilidadBruta,
      creadoPorId: session.user.id,
      items: { create: itemsCalculados },
    },
    include: { items: true, creadoPor: { select: { name: true, email: true } } },
  })

  try {
    const admins = await prisma.user.findMany({
      where: { role: 'ADMIN', tenants: { some: { tenantId } }, email: { endsWith: DOMINIO_ADMIN_PM } },
      select: { email: true },
    })
    const adminEmails = admins.map(a => a.email)
    const fromEmail = session.user.email
    if (adminEmails.length && fromEmail) {
      await sendMail({
        fromEmail,
        toEmails: adminEmails,
        subject: `Nueva cotización — ${cot.nombreTrabajo} · ${clienteNombre}`,
        html: templateNuevaCotizacionPM({
          usuarioNombre: session.user.name ?? fromEmail,
          usuarioEmail:  fromEmail,
          nombreTrabajo: cot.nombreTrabajo,
          clienteNombre: cot.clienteNombre,
          montoVenta:    cot.montoVenta,
          cotizacionId:  cot.id,
        }),
      })
    }
  } catch (err) {
    console.error('[cotizaciones-pm] Error enviando notificación a admins:', err)
  }

  return NextResponse.json(cot, { status: 201 })
}

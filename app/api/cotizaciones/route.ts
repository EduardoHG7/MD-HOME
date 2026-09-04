export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendMail, templateNuevaCotizacion } from '@/lib/mail'
import { sendWhatsApp } from '@/lib/whatsapp'
import { getActiveTenantId } from '@/lib/tenant'
import { receptoresSolicitud, tenantsDondeApruebo } from '@/lib/aprobaciones'

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const lineaId = searchParams.get('lineaId')
  const tenantId = getActiveTenantId()

  const tenantFilter = tenantId
    ? { linea: { categoria: { presupuesto: { evento: { tenants: { some: { tenantId } } } } } } }
    : {}

  const esAprobadorAqui = tenantId ? (await tenantsDondeApruebo(session.user.id)).includes(tenantId) : false
  const userFilter = session.user.role === 'ADMIN' || esAprobadorAqui
    ? (lineaId ? { lineaId } : {})
    : { creadoPorId: session.user.id, ...(lineaId ? { lineaId } : {}) }

  const where = { ...tenantFilter, ...userFilter }

  const cotizaciones = await prisma.cotizacion.findMany({
    where,
    include: {
      facturas:    true,
      creadoPor:   { select: { name: true, email: true } },
      aprobadaPor: { select: { name: true, email: true } },
      linea: {
        include: {
          categoria: {
            include: { presupuesto: { include: { evento: { select: { nombre: true, id: true } } } } }
          }
        }
      },
    },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(cotizaciones)
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { lineaId, concepto, descripcion, facturas } = await req.json()
  if (!lineaId || !facturas?.length) {
    return NextResponse.json({ error: 'Faltan datos requeridos' }, { status: 400 })
  }

  const montoTotal = facturas.reduce((s: number, f: { monto: number }) => s + (f.monto ?? 0), 0)

  const cot = await prisma.cotizacion.create({
    data: {
      lineaId,
      creadoPorId: session.user.id,
      concepto:    concepto?.trim() || null,
      descripcion: descripcion ?? null,
      montoTotal,
      facturas: {
        create: facturas.map((f: { descripcion: string; proveedor?: string; monto: number; archivoNombre?: string }) => ({
          descripcion:   f.descripcion,
          proveedor:     f.proveedor     ?? null,
          monto:         f.monto         ?? 0,
          archivoNombre: f.archivoNombre ?? null,
        })),
      },
    },
    include: {
      facturas: true,
      creadoPor: { select: { name: true, email: true } },
      linea: {
        include: {
          categoria: {
            include: { presupuesto: { include: { evento: { select: { nombre: true, tenants: true } } } } }
          }
        }
      },
    },
  })

  // Notificar a los receptores configurados de la(s) empresa(s) del evento;
  // sin configuración, cae a los ADMIN de esas empresas (o de todas si el
  // evento no tiene empresa asignada, para no dejar la cotización sin notificar)
  try {
    const eventoTenantIds = cot.linea.categoria.presupuesto.evento.tenants.map(t => t.tenantId)
    const admins = await receptoresSolicitud(eventoTenantIds, async () => {
      const adminFilter = eventoTenantIds.length
        ? { role: 'ADMIN', tenants: { some: { tenantId: { in: eventoTenantIds } } } }
        : { role: 'ADMIN' }
      return prisma.user.findMany({ where: adminFilter, select: { id: true, name: true, email: true, telefono: true } })
    })
    const adminEmails = admins.map(a => a.email)
    const fromEmail   = session.user.email
    if (adminEmails.length && fromEmail) {
      await sendMail({
        fromEmail,
        toEmails: adminEmails,
        subject:  `Nueva cotización — ${cot.linea.categoria.presupuesto.evento.nombre} · ${cot.linea.descripcion}`,
        html: templateNuevaCotizacion({
          usuarioNombre:      session.user.name ?? fromEmail,
          usuarioEmail:       fromEmail,
          eventoNombre:       cot.linea.categoria.presupuesto.evento.nombre,
          categoriaNombre:    cot.linea.categoria.nombre,
          subcategoriaNombre: cot.linea.descripcion,
          descripcion:        descripcion ?? null,
          montoTotal,
          numFacturas:        facturas.length,
          cotizacionId:       cot.id,
        }),
      })
    }

    const url = process.env.NEXTAUTH_URL ?? ''
    const adminsConPhone = admins.filter(a => a.telefono)
    for (const admin of adminsConPhone) {
      try {
        await sendWhatsApp(
          admin.telefono!,
          `💰 *Magic Dreams — Nueva cotización*\n\n` +
          `*${session.user.name ?? fromEmail}* subió una cotización para aprobación.\n\n` +
          `*Evento:* ${cot.linea.categoria.presupuesto.evento.nombre}\n` +
          `*Subcategoría:* ${cot.linea.descripcion}${cot.concepto ? ` › ${cot.concepto}` : ''}\n` +
          `*Monto total:* $${montoTotal.toFixed(2)}\n\n` +
          `Revisar y aprobar:\n${url}/admin/solicitudes?tab=cotizaciones&id=${cot.id}`
        )
      } catch (err) {
        console.error('[cotizaciones] Error enviando WhatsApp a admin:', err)
      }
    }
  } catch (err) {
    console.error('[cotizaciones] Error enviando notificaciones a admins:', err)
  }

  return NextResponse.json(cot, { status: 201 })
}

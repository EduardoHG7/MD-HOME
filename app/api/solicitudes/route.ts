export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendMail, templateNuevaSolicitud } from '@/lib/mail'
import { sendWhatsApp } from '@/lib/whatsapp'
import { getActiveTenantId } from '@/lib/tenant'
import { receptoresSolicitud, tenantsDondeApruebo } from '@/lib/aprobaciones'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const tenantId = getActiveTenantId()

  const tenantFilter = tenantId ? { evento: { tenants: { some: { tenantId } } } } : {}
  const esAprobadorAqui = tenantId ? (await tenantsDondeApruebo(session.user.id)).includes(tenantId) : false
  const userFilter   = session.user.role === 'ADMIN' || session.user.role === 'CONTABILIDAD' || esAprobadorAqui
    ? {}
    : { solicitanteId: session.user.id }

  const solicitudes = await prisma.solicitud.findMany({
    where: { ...tenantFilter, ...userFilter },
    include: {
      evento: true,
      solicitante:  { select: { name: true, email: true } },
      aprobadoPor:  { select: { name: true, email: true } },
      tarifa: true,
      asignaciones: {
        include: {
          aplicante: { select: { id: true, nombreCompleto: true, cedula: true, telefono: true } },
          registros: { orderBy: { timestamp: 'asc' } },
        },
        where: { estado: 'ACTIVA' },
      },
    },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(solicitudes)
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { eventoId, numPersonas, funcion, fechaInicioLabor, fechaFinLabor, presupuesto, comentario } = await req.json()

  if (!eventoId || !numPersonas || !funcion || !fechaInicioLabor || !fechaFinLabor) {
    return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 })
  }

  const solicitud = await prisma.solicitud.create({
    data: {
      eventoId,
      solicitanteId: session.user.id,
      numPersonas,
      funcion,
      fechaInicioLabor: new Date(fechaInicioLabor),
      fechaFinLabor:    new Date(fechaFinLabor),
      presupuesto:      presupuesto ? parseFloat(presupuesto) : null,
      comentario:       comentario?.trim() || null,
    },
    include: { evento: { include: { tenants: true } }, tarifa: true },
  })

  const url = process.env.NEXTAUTH_URL ?? ''

  try {
    // Notificar a los receptores configurados para la(s) empresa(s) del
    // evento; sin configuración, cae a los ADMIN de esas empresas (o de
    // todas si el evento no tiene empresa asignada, para no dejar la
    // solicitud sin notificar).
    const eventoTenantIds = solicitud.evento.tenants.map(t => t.tenantId)
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
        subject:  'Nueva solicitud de personal',
        html: templateNuevaSolicitud({
          solicitanteNombre: session.user.name ?? fromEmail,
          solicitanteEmail:  fromEmail,
          eventoNombre:      solicitud.evento.nombre,
          funcion:           solicitud.funcion,
          numPersonas:       solicitud.numPersonas,
          fechaInicioLabor,
          fechaFinLabor,
          solicitudId:       solicitud.id,
        }),
      })
    }
    for (const admin of admins.filter(a => a.telefono)) {
      try { await sendWhatsApp(admin.telefono!, `Nueva solicitud\nEvento: ${solicitud.evento.nombre}\nFuncion: ${solicitud.funcion}\n${url}/admin/solicitudes?tab=personal&id=${solicitud.id}`) } catch {}
    }
  } catch (err) { console.error('[solicitudes]', err) }

  return NextResponse.json(solicitud, { status: 201 })
}
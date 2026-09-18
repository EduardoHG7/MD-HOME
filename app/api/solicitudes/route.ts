export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendMail, templateNuevaSolicitud } from '@/lib/mail'
import { sendWhatsApp } from '@/lib/whatsapp'
import { getActiveTenantId } from '@/lib/tenant'
import { receptoresSolicitud, tenantsDondeApruebo } from '@/lib/aprobaciones'

// Solicitudes de personal (staffing) son de Panatickets/Magic Dreams — no
// del negocio de Print Media, aunque comparta el evento con ellas para el
// Cotizador PM.
async function tenantBloqueado() {
  const tenantId = getActiveTenantId()
  const tenant = tenantId ? await prisma.tenant.findUnique({ where: { id: tenantId } }) : null
  return tenant?.slug === 'printmediapty'
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (await tenantBloqueado()) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const tenantId = getActiveTenantId()
  // Sin empresa activa no hay a qué empresa segmentar — mejor no devolver
  // nada que devolver todo sin filtrar.
  if (!tenantId) return NextResponse.json([])

  const tenantFilter = { evento: { tenants: { some: { tenantId } } } }
  const esAprobadorAqui = (await tenantsDondeApruebo(session.user.id)).includes(tenantId)
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

  const { eventoId, numPersonas, funcion, fechaInicioLabor, fechaFinLabor, presupuesto, comentario, tipoTarifa } = await req.json()

  if (!eventoId || !numPersonas || !funcion || !fechaInicioLabor || !fechaFinLabor) {
    return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 })
  }

  // En Panatickets el eventual se asigna directo, sin aprobación: el propio
  // usuario elige la tarifa al crear la solicitud y esta queda aprobada de
  // una vez, lista para asignar aplicantes.
  const activeTenantId = getActiveTenantId()
  const activeTenant = activeTenantId ? await prisma.tenant.findUnique({ where: { id: activeTenantId } }) : null
  const esPanatickets = activeTenant?.slug === 'panatickets'

  let tarifaId: string | null = null
  let costoTotal: number | null = null
  if (esPanatickets) {
    if (!tipoTarifa) return NextResponse.json({ error: 'Selecciona un tipo de tarifa' }, { status: 400 })
    const tarifa = await prisma.tarifa.findFirst({ where: { tipo: tipoTarifa, tenantId: activeTenantId } })
    if (!tarifa) return NextResponse.json({ error: 'Tipo de tarifa inválido' }, { status: 400 })
    const dias = Math.max(1, Math.ceil((new Date(fechaFinLabor).getTime() - new Date(fechaInicioLabor).getTime()) / (1000 * 60 * 60 * 24)) + 1)
    tarifaId = tarifa.id
    costoTotal = tarifa.precioPorDia * numPersonas * dias
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
      ...(esPanatickets ? {
        estado: 'APROBADA', tarifaId, costoTotal,
        aprobadoPorId: session.user.id, aprobadoEn: new Date(),
      } : {}),
    },
    include: { evento: true, tarifa: true },
  })

  // En Panatickets no hay nada que aprobar — el eventual ya quedó
  // asignable, no hace falta notificar a un admin para que revise nada.
  if (esPanatickets) return NextResponse.json(solicitud, { status: 201 })

  const url = process.env.NEXTAUTH_URL ?? ''

  try {
    // Quién recibe se rige por la empresa activa de quien crea la
    // solicitud (su asignación), no por a cuántas empresas esté etiquetado
    // el evento — un evento compartido entre varias empresas nunca debe
    // ampliar a quién llega esto. Sin configuración de Aprobaciones, cae a
    // los ADMIN de esa única empresa.
    const activeTenantId = getActiveTenantId()
    const tenantsNotif = activeTenantId ? [activeTenantId] : []
    const admins = await receptoresSolicitud(tenantsNotif, async () => {
      if (!tenantsNotif.length) return []
      return prisma.user.findMany({
        where: { role: 'ADMIN', tenants: { some: { tenantId: { in: tenantsNotif } } } },
        select: { id: true, name: true, email: true, telefono: true },
      })
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
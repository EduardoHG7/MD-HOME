export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { esOperadorPanatickets } from '@/lib/permisos'

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const evento = await prisma.evento.findUnique({
    where: { id: params.id },
    select: {
      id: true, nombre: true, tipoEvento: true, estado: true,
      logisticaAplica: true, cierreComentario: true, cierreAprobado: true,
      cierreAprobadoPor: true, cierreAprobadoEn: true,
    },
  })
  if (!evento) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  return NextResponse.json(evento)
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const esAdmin = session.user.role === 'ADMIN'
  const esOperador = esOperadorPanatickets(session.user.email, session.user.role)
  if (!esAdmin && !esOperador) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  // El operador Panatickets solo puede editar eventos de esa empresa, y solo
  // nombre/fechas/venue/estado — nunca empresas, responsable de docs, socio, etc.
  if (!esAdmin) {
    const evento = await prisma.evento.findUnique({
      where: { id: params.id },
      select: { tenants: { select: { tenant: { select: { slug: true } } } } },
    })
    if (!evento || !evento.tenants.some(t => t.tenant.slug === 'panatickets')) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }
  }

  const body = await req.json()
  const { nombre, descripcion, fechaInicio, fechaFin, estado, tipoEvento, venueId, tieneSocio, nombreSocio, montajeInicio, desmontajeFin, docsResponsableId, tenantIds } = esAdmin
    ? body
    : { nombre: body.nombre, descripcion: undefined, fechaInicio: body.fechaInicio, fechaFin: body.fechaFin, estado: body.estado, tipoEvento: undefined, venueId: body.venueId, tieneSocio: undefined, nombreSocio: undefined, montajeInicio: undefined, desmontajeFin: undefined, docsResponsableId: undefined, tenantIds: undefined }

  const evento = await prisma.evento.update({
    where: { id: params.id },
    data: {
      ...(nombre      !== undefined && { nombre }),
      ...(descripcion !== undefined && { descripcion }),
      ...(fechaInicio !== undefined && { fechaInicio: new Date(fechaInicio) }),
      ...(fechaFin    !== undefined && { fechaFin:    new Date(fechaFin) }),
      ...(estado      !== undefined && { estado }),
      ...(tipoEvento  !== undefined && { tipoEvento: tipoEvento || null }),
      ...(venueId     !== undefined && { venueId: venueId || null }),
      ...(tieneSocio  !== undefined && { tieneSocio }),
      ...(nombreSocio !== undefined && { nombreSocio: tieneSocio ? (nombreSocio || null) : null }),
      ...(montajeInicio !== undefined && { montajeInicio: montajeInicio ? new Date(montajeInicio) : null }),
      ...(desmontajeFin !== undefined && { desmontajeFin: desmontajeFin ? new Date(desmontajeFin) : null }),
      ...(docsResponsableId !== undefined && { docsResponsableId: docsResponsableId || null }),
      ...(Array.isArray(tenantIds) && tenantIds.length > 0 && {
        tenantId: tenantIds[0],
        tenants: {
          deleteMany: {},
          create: tenantIds.map((id: string) => ({ tenantId: id })),
        },
      }),
    },
    include: { _count: { select: { asignaciones: true } }, venue: true, tenants: { select: { tenantId: true } } },
  })

  return NextResponse.json(evento)
}

// Borrado PERMANENTE del evento y todo lo relacionado (asignaciones, registros
// de asistencia, solicitudes, caja menuda, facturas, presupuesto — este último
// arrastra sus categorías/líneas/cotizaciones/patrocinios/tickets en cascada).
// Los que ya tienen onDelete:Cascade en el evento (contrato, formulario,
// documentos, tenants) se limpian solos al borrar el Evento al final.
// Solo ADMIN. Irreversible — no toca los archivos ya subidos a SharePoint.
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const eventoId = params.id
  const existe = await prisma.evento.findUnique({ where: { id: eventoId }, select: { id: true } })
  if (!existe) return NextResponse.json({ error: 'Evento no encontrado' }, { status: 404 })

  try {
    await prisma.$transaction([
      prisma.registroAsistencia.deleteMany({ where: { asignacion: { eventoId } } }),
      prisma.asignacionAplicante.deleteMany({ where: { eventoId } }),
      prisma.solicitud.deleteMany({ where: { eventoId } }),
      prisma.cajaMenuda.deleteMany({ where: { eventoId } }),
      prisma.factura.deleteMany({ where: { eventoId } }),
      prisma.presupuesto.deleteMany({ where: { eventoId } }),
      prisma.evento.delete({ where: { id: eventoId } }),
    ])
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error al eliminar el evento'
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}


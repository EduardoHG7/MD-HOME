export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getActiveTenantId } from '@/lib/tenant'

export async function GET(req: Request) {
  const tenantId = getActiveTenantId()
  const { searchParams } = new URL(req.url)
  const incluirCancelados = searchParams.get('incluirCancelados') === '1'

  const eventos = await prisma.evento.findMany({
    where: {
      ...(incluirCancelados ? {} : { estado: { not: 'CANCELADO' } }),
      ...(tenantId ? { tenants: { some: { tenantId } } } : {}),
    },
    orderBy: { fechaInicio: 'desc' },
    include: {
      _count: { select: { asignaciones: true } },
      venue: true,
      tenants: { select: { tenantId: true } },
    },
  })
  return NextResponse.json(eventos)
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const tenantId = getActiveTenantId()
  const { nombre, descripcion, fechaInicio, fechaFin, tipoEvento, venueId, tieneSocio, nombreSocio, estado, montajeInicio, desmontajeFin, docsResponsableId, tenantIds } = await req.json()

  // Empresas a las que pertenece el evento: las seleccionadas o la activa
  const ids: string[] = Array.isArray(tenantIds) && tenantIds.length > 0
    ? tenantIds
    : (tenantId ? [tenantId] : [])

  const evento = await prisma.evento.create({
    data: {
      nombre, descripcion,
      fechaInicio: new Date(fechaInicio),
      fechaFin:    new Date(fechaFin),
      estado:      estado || 'ACTIVO',
      tipoEvento:  tipoEvento  || null,
      venueId:     venueId     || null,
      tieneSocio:  tieneSocio  ?? false,
      nombreSocio: tieneSocio ? (nombreSocio || null) : null,
      tenantId:    ids[0] ?? null,
      montajeInicio: montajeInicio ? new Date(montajeInicio) : null,
      desmontajeFin: desmontajeFin ? new Date(desmontajeFin) : null,
      docsResponsableId: docsResponsableId || null,
      tenants: { create: ids.map(id => ({ tenantId: id })) },
    },
    include: { venue: true, tenants: { select: { tenantId: true } } },
  })
  return NextResponse.json(evento, { status: 201 })
}

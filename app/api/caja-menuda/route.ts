export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendWhatsApp } from '@/lib/whatsapp'
import { getActiveTenantId } from '@/lib/tenant'
import { receptoresSolicitud, tenantsDondeApruebo } from '@/lib/aprobaciones'

const include = {
  evento:      { select: { nombre: true } },
  solicitante: { select: { name: true, email: true } },
  aprobadoPor: { select: { name: true, email: true } },
  pagadoPor:   { select: { name: true, email: true } },
  facturas:    true,
}

// Caja Menuda es de Panatickets/Magic Dreams — no del negocio de Print
// Media, aunque comparta el evento con ellas.
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

  const cajas = await prisma.cajaMenuda.findMany({
    where: { ...tenantFilter, ...userFilter },
    include,
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(cajas)
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { eventoId, descripcion, montoSolicitado } = await req.json()
  if (!eventoId || !descripcion || !montoSolicitado) {
    return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 })
  }

  const existing = await prisma.cajaMenuda.findUnique({
    where: { solicitanteId_eventoId: { solicitanteId: session.user.id, eventoId } },
  })
  if (existing) return NextResponse.json({ error: 'Ya tienes una solicitud de caja menuda para este evento' }, { status: 409 })

  const caja = await prisma.cajaMenuda.create({
    data: { eventoId, solicitanteId: session.user.id, descripcion, montoSolicitado },
    include,
  })

  try {
    const evento = await prisma.evento.findUnique({ where: { id: eventoId }, select: { tenants: { select: { tenantId: true } } } })
    const eventoTenantIds = evento?.tenants.map(t => t.tenantId) ?? []
    const activeTenantId = getActiveTenantId()
    const tenantsNotif = eventoTenantIds.length ? eventoTenantIds : (activeTenantId ? [activeTenantId] : [])
    const admins = await receptoresSolicitud(tenantsNotif, () => {
      if (!tenantsNotif.length) return Promise.resolve([])
      return prisma.user.findMany({
        where: { role: 'ADMIN', tenants: { some: { tenantId: { in: tenantsNotif } } } },
        select: { id: true, name: true, email: true, telefono: true },
      })
    })
    for (const a of admins) {
      if (a.telefono) await sendWhatsApp(a.telefono, `Nueva Caja Menuda\nEvento: ${caja.evento.nombre}\nMonto: $${montoSolicitado}`).catch(() => {})
    }
  } catch {}

  return NextResponse.json(caja, { status: 201 })
}
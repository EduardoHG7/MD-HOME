export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getActiveTenantId } from '@/lib/tenant'
import { sendMail, templateRespuestaCostoRealPM } from '@/lib/mail'

const TENANT_SLUG = 'printmediapty'

async function tenantAutorizado() {
  const tenantId = getActiveTenantId()
  const tenant = tenantId ? await prisma.tenant.findUnique({ where: { id: tenantId } }) : null
  return tenant?.slug === TENANT_SLUG ? tenantId : null
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  if (!(await tenantAutorizado())) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const { estado, notaAdmin } = await req.json()
  if (!['APROBADO', 'RECHAZADO'].includes(estado)) {
    return NextResponse.json({ error: 'Estado inválido' }, { status: 400 })
  }

  const existente = await prisma.cotizacionPM.findUnique({ where: { id: params.id } })
  if (!existente) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })
  if (existente.costoRealEstado !== 'PENDIENTE') {
    return NextResponse.json({ error: 'No hay un costo real pendiente de revisión' }, { status: 400 })
  }

  const cot = await prisma.cotizacionPM.update({
    where: { id: params.id },
    data: {
      costoRealEstado: estado,
      costoRealNotaAdmin: notaAdmin?.trim() || null,
      costoRealAprobadoPorId: session.user.id,
      costoRealAprobadoEn: new Date(),
    },
    include: { creadoPor: { select: { name: true, email: true } } },
  })

  try {
    const fromEmail = session.user.email
    if (cot.creadoPor.email && fromEmail) {
      await sendMail({
        fromEmail,
        toEmails: [cot.creadoPor.email],
        subject: `Costo real ${estado === 'APROBADO' ? 'aprobado' : 'rechazado'} — ${cot.nombreTrabajo}`,
        html: templateRespuestaCostoRealPM({
          usuarioNombre:  cot.creadoPor.name ?? cot.creadoPor.email,
          nombreTrabajo:  cot.nombreTrabajo,
          clienteNombre:  cot.clienteNombre,
          estado,
          costoRealTotal: cot.costoRealTotal ?? 0,
          notaAdmin:      cot.costoRealNotaAdmin,
          adminNombre:    session.user.name ?? fromEmail,
        }),
      })
    }
  } catch (err) {
    console.error('[cotizaciones-pm] Error enviando respuesta de costo real:', err)
  }

  return NextResponse.json(cot)
}

export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getActiveTenantId } from '@/lib/tenant'
import { sendMail, templateRespuestaCotizacionPM } from '@/lib/mail'

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
  if (!['APROBADA', 'RECHAZADA'].includes(estado)) {
    return NextResponse.json({ error: 'Estado inválido' }, { status: 400 })
  }

  const existente = await prisma.cotizacionPM.findUnique({ where: { id: params.id } })
  if (!existente) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })
  if (existente.estado !== 'PENDIENTE') {
    return NextResponse.json({ error: 'Esta cotización ya fue revisada' }, { status: 400 })
  }

  const cot = await prisma.cotizacionPM.update({
    where: { id: params.id },
    data: {
      estado,
      notaAdmin: notaAdmin?.trim() || null,
      aprobadaPorId: session.user.id,
      aprobadaEn: new Date(),
    },
    include: { creadoPor: { select: { name: true, email: true } } },
  })

  try {
    const fromEmail = session.user.email
    if (cot.creadoPor.email && fromEmail) {
      await sendMail({
        fromEmail,
        toEmails: [cot.creadoPor.email],
        subject: `Cotización ${estado === 'APROBADA' ? 'aprobada' : 'rechazada'} — ${cot.nombreTrabajo}`,
        html: templateRespuestaCotizacionPM({
          usuarioNombre: cot.creadoPor.name ?? cot.creadoPor.email,
          nombreTrabajo: cot.nombreTrabajo,
          clienteNombre: cot.clienteNombre,
          estado,
          montoVenta: cot.montoVenta,
          notaAdmin: cot.notaAdmin,
          adminNombre: session.user.name ?? fromEmail,
        }),
      })
    }
  } catch (err) {
    console.error('[cotizaciones-pm] Error enviando respuesta al usuario:', err)
  }

  return NextResponse.json(cot)
}

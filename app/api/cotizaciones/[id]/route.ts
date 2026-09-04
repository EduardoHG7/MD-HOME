export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendMail, templateRespuestaCotizacion } from '@/lib/mail'
import { sendWhatsApp } from '@/lib/whatsapp'
import { puedeAprobar, receptoresRespuesta } from '@/lib/aprobaciones'

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { estado, notaAdmin } = await req.json()

  const existente = await prisma.cotizacion.findUnique({
    where: { id: params.id },
    select: { linea: { select: { categoria: { select: { presupuesto: { select: { evento: { select: { tenants: { select: { tenantId: true } } } } } } } } } } },
  })
  const tenantIds = existente?.linea.categoria.presupuesto.evento.tenants.map(t => t.tenantId) ?? []
  if (!(await puedeAprobar(tenantIds, session.user))) {
    return NextResponse.json({ error: 'No autorizado para aprobar/rechazar' }, { status: 403 })
  }

  const cot = await prisma.cotizacion.update({
    where: { id: params.id },
    data: {
      estado,
      notaAdmin: notaAdmin ?? null,
      ...(estado === 'APROBADA' ? { aprobadaPorId: session.user.id, aprobadaEn: new Date() } : {}),
    },
    include: {
      facturas:    true,
      creadoPor:   { select: { id: true, name: true, email: true, telefono: true } },
      aprobadaPor: { select: { name: true, email: true } },
      linea: {
        include: {
          categoria: {
            include: { presupuesto: { include: { evento: { select: { nombre: true, tenants: true } } } } }
          }
        }
      },
    },
  })

  // Si se aprueba y tiene concepto, rechazar automáticamente las otras cotizaciones pendientes del mismo concepto+linea
  if (estado === 'APROBADA' && cot.concepto) {
    await prisma.cotizacion.updateMany({
      where: {
        lineaId:  cot.lineaId,
        concepto: cot.concepto,
        estado:   'PENDIENTE',
        id:       { not: cot.id },
      },
      data: {
        estado:    'RECHAZADA',
        notaAdmin: `Rechazada automáticamente: se aprobó otra cotización para "${cot.concepto}"`,
      },
    })
  }

  if ((estado === 'APROBADA' || estado === 'RECHAZADA') && session.user.email) {
    const emoji = estado === 'APROBADA' ? '✅' : '❌'
    const texto = estado === 'APROBADA' ? 'aprobada' : 'rechazada'
    const eventoTenantIds = cot.linea.categoria.presupuesto.evento.tenants.map(t => t.tenantId)
    const destinatarios = await receptoresRespuesta(eventoTenantIds, async () => [cot.creadoPor])
    const destinatarioEmails = destinatarios.map(d => d.email).filter(Boolean)

    if (destinatarioEmails.length) {
      try {
        await sendMail({
          fromEmail: session.user.email,
          toEmails:  destinatarioEmails,
          subject:   `Tu cotización fue ${estado === 'APROBADA' ? 'aprobada ✅' : 'rechazada ❌'} — ${cot.linea.descripcion}`,
          html: templateRespuestaCotizacion({
            usuarioNombre:      cot.creadoPor.name ?? cot.creadoPor.email,
            eventoNombre:       cot.linea.categoria.presupuesto.evento.nombre,
            categoriaNombre:    cot.linea.categoria.nombre,
            subcategoriaNombre: cot.linea.descripcion,
            estado:             estado as 'APROBADA' | 'RECHAZADA',
            montoTotal:         cot.montoTotal,
            notaAdmin:          notaAdmin ?? null,
            adminNombre:        session.user.name ?? session.user.email ?? '',
          }),
        })
      } catch (err) {
        console.error('[cotizaciones/id] Error enviando email:', err)
      }
    }

    for (const destinatario of destinatarios.filter(d => d.telefono)) {
      try {
        const lines = [
          `${emoji} *Magic Dreams Productions*`,
          `La cotización fue *${texto}*.`,
          ``,
          `*Evento:* ${cot.linea.categoria.presupuesto.evento.nombre}`,
          `*Subcategoría:* ${cot.linea.descripcion}`,
          `*Monto:* $${cot.montoTotal.toFixed(2)}`,
          ...(notaAdmin ? [`*Nota del admin:* ${notaAdmin}`] : []),
          `*Revisado por:* ${session.user.name ?? session.user.email}`,
          ...(estado === 'APROBADA' ? [`\nRecuerda subir la factura real para completar el proceso.`] : []),
        ]
        await sendWhatsApp(destinatario.telefono!, lines.join('\n'))
      } catch (err) {
        console.error('[cotizaciones/id] Error enviando WhatsApp:', err)
      }
    }

    // Notificar a usuarios de CONTABILIDAD
    try {
      const contabilidad = await prisma.user.findMany({ where: { role: 'CONTABILIDAD' }, select: { telefono: true } })
      const msgCont = [
        `📊 *Magic Dreams — Cotización ${estado === 'APROBADA' ? 'aprobada' : 'rechazada'}*`,
        ``,
        `*Evento:* ${cot.linea.categoria.presupuesto.evento.nombre}`,
        `*Subcategoría:* ${cot.linea.descripcion}`,
        `*Monto:* $${cot.montoTotal.toFixed(2)}`,
        `*Aprobado por:* ${session.user.name ?? session.user.email}`,
      ].join('\n')
      for (const u of contabilidad) {
        if (u.telefono) await sendWhatsApp(u.telefono, msgCont).catch(() => {})
      }
    } catch (err) {
      console.error('[cotizaciones/id] Error notificando contabilidad:', err)
    }
  }

  return NextResponse.json(cot)
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const cot = await prisma.cotizacion.findUnique({ where: { id: params.id } })
  if (!cot) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })
  if (cot.creadoPorId !== session.user.id && session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }
  if (cot.estado !== 'PENDIENTE') {
    return NextResponse.json({ error: 'Solo se pueden eliminar cotizaciones pendientes' }, { status: 400 })
  }

  await prisma.cotizacion.delete({ where: { id: params.id } })
  return NextResponse.json({ ok: true })
}

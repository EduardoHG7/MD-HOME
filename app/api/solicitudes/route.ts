export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendMail, templateNuevaSolicitud } from '@/lib/mail'
import { sendWhatsApp } from '@/lib/whatsapp'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const where = session.user.role === 'ADMIN' ? {} : { solicitanteId: session.user.id }

  const solicitudes = await prisma.solicitud.findMany({
    where,
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
    include: { evento: true, tarifa: true },
  })

  const url = process.env.NEXTAUTH_URL ?? ''

  try {
    const admins      = await prisma.user.findMany({ where: { role: 'ADMIN' }, select: { email: true, telefono: true } })
    const adminEmails = admins.map(a => a.email)
    const fromEmail   = session.user.email
    if (adminEmails.length && fromEmail) {
      await sendMail({
        fromEmail,
        toEmails: adminEmails,
        subject:  `Nueva solicitud de personal — ${solicitud.evento.nombre}`,
        html: templateNuevaSolicitud({
          solicitanteNombre: session.user.name ?? fromEmail,
          solicitanteEmail:  fromEmail,
          eventoNombre:      solicitud.evento.nombre,
          funcion:           solicitud.funcion,
          numPersonas:       solicitud.numPersonas,
          fechaInicioLabor,
          fechaFinLabor,
        }),
      })
    }

    const adminsConPhone = admins.filter(a => a.telefono)
    for (const admin of adminsConPhone) {
      try {
        await sendWhatsApp(
          admin.telefono!,
          `📋 *Magic Dreams — Nueva solicitud de personal*\n\n` +
          `*Solicitante:* ${session.user.name ?? fromEmail}\n` +
          `*Evento:* ${solicitud.evento.nombre}\n` +
          `*Función:* ${solicitud.funcion}\n` +
          `*Personas:* ${solicitud.numPersonas}\n\n` +
          `Revisar y aprobar:\n${url}/admin/solicitudes`
        )
      } catch (err) {
        console.error('[solicitudes] Error enviando WhatsApp a admin:', err)
      }
    }
  } catch (err) {
    console.error('[solicitudes] Error enviando notificaciones a admins:', err)
  }

  return NextResponse.json(solicitud, { status: 201 })
}

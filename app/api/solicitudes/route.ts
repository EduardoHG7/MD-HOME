export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendMail, templateNuevaSolicitud } from '@/lib/mail'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const where = session.user.role === 'ADMIN' ? {} : { solicitanteId: session.user.id }

  const solicitudes = await prisma.solicitud.findMany({
    where,
    include: {
      evento: true,
      solicitante: { select: { name: true, email: true } },
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

  const { eventoId, numPersonas, funcion, fechaInicioLabor, fechaFinLabor } = await req.json()

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
    },
    include: { evento: true, tarifa: true },
  })

  // Notificar a todos los admins por correo (sin bloquear la respuesta)
  prisma.user.findMany({ where: { role: 'ADMIN' }, select: { email: true } })
    .then(admins => {
      const adminEmails = admins.map(a => a.email)
      if (!adminEmails.length || !session.user.email) return
      return sendMail({
        fromEmail: session.user.email,
        toEmails:  adminEmails,
        subject:   `Nueva solicitud de personal — ${solicitud.evento.nombre}`,
        html: templateNuevaSolicitud({
          solicitanteNombre: session.user.name ?? session.user.email,
          solicitanteEmail:  session.user.email,
          eventoNombre:      solicitud.evento.nombre,
          funcion:           solicitud.funcion,
          numPersonas:       solicitud.numPersonas,
          fechaInicioLabor:  fechaInicioLabor,
          fechaFinLabor:     fechaFinLabor,
        }),
      })
    })
    .catch(err => console.error('[solicitudes] Error enviando email:', err))

  return NextResponse.json(solicitud, { status: 201 })
}

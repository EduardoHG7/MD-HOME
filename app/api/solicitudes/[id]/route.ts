export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendMail, templateRespuestaSolicitud, templateNuevaSolicitud } from '@/lib/mail'

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { estado, costoTotal, notaAdmin, tipoTarifa } = await req.json()

  let tarifaId: string | undefined
  if (tipoTarifa) {
    const tarifa = await prisma.tarifa.findUnique({ where: { tipo: tipoTarifa } })
    if (tarifa) tarifaId = tarifa.id
  }

  const solicitud = await prisma.solicitud.update({
    where: { id: params.id },
    data: {
      estado,
      costoTotal,
      notaAdmin,
      ...(tarifaId ? { tarifaId } : {}),
      ...(estado === 'APROBADA' ? {
        aprobadoPorId: session.user.id,
        aprobadoEn:    new Date(),
      } : {}),
    },
    include: {
      evento: true,
      tarifa: true,
      solicitante: { select: { name: true, email: true } },
      aprobadoPor:  { select: { name: true, email: true } },
    },
  })

  if ((estado === 'APROBADA' || estado === 'RECHAZADA') && session.user.email && solicitud.solicitante.email) {
    try {
      await sendMail({
        fromEmail: session.user.email,
        toEmails:  [solicitud.solicitante.email],
        subject:   `Tu solicitud fue ${estado === 'APROBADA' ? 'aprobada ✅' : 'rechazada ❌'} — ${solicitud.evento.nombre}`,
        html: templateRespuestaSolicitud({
          solicitanteNombre: solicitud.solicitante.name ?? solicitud.solicitante.email,
          eventoNombre:      solicitud.evento.nombre,
          estado:            estado as 'APROBADA' | 'RECHAZADA',
          funcion:           solicitud.funcion,
          numPersonas:       solicitud.numPersonas,
          costoTotal:        costoTotal ?? null,
          notaAdmin:         notaAdmin ?? null,
          adminNombre:       session.user.name ?? session.user.email ?? '',
        }),
      })
    } catch (err) {
      console.error('[solicitudes/id] Error enviando email:', err)
    }
  }

  return NextResponse.json(solicitud)
}

// Eliminar solicitud (solo el solicitante dueño y solo si está PENDIENTE)
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const solicitud = await prisma.solicitud.findUnique({
    where: { id: params.id },
    select: { solicitanteId: true, estado: true },
  })

  if (!solicitud) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })
  if (solicitud.solicitanteId !== session.user.id && session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }
  if (solicitud.estado !== 'PENDIENTE') {
    return NextResponse.json({ error: 'Solo se pueden eliminar solicitudes pendientes' }, { status: 400 })
  }

  await prisma.solicitud.delete({ where: { id: params.id } })
  return NextResponse.json({ ok: true })
}

// Reenviar notificación a admins (solicitante reenvía su solicitud pendiente)
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const solicitud = await prisma.solicitud.findUnique({
    where: { id: params.id },
    include: { evento: true },
  })

  if (!solicitud) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })
  if (solicitud.solicitanteId !== session.user.id) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }
  if (solicitud.estado !== 'PENDIENTE') {
    return NextResponse.json({ error: 'Solo se pueden reenviar solicitudes pendientes' }, { status: 400 })
  }

  try {
    const admins      = await prisma.user.findMany({ where: { role: 'ADMIN' }, select: { email: true } })
    const adminEmails = admins.map(a => a.email)
    const fromEmail   = session.user.email
    if (adminEmails.length && fromEmail) {
      await sendMail({
        fromEmail,
        toEmails: adminEmails,
        subject:  `[Reenvío] Solicitud de personal — ${solicitud.evento.nombre}`,
        html: templateNuevaSolicitud({
          solicitanteNombre: session.user.name ?? fromEmail,
          solicitanteEmail:  fromEmail,
          eventoNombre:      solicitud.evento.nombre,
          funcion:           solicitud.funcion,
          numPersonas:       solicitud.numPersonas,
          fechaInicioLabor:  solicitud.fechaInicioLabor?.toISOString() ?? '',
          fechaFinLabor:     solicitud.fechaFinLabor?.toISOString()    ?? '',
        }),
      })
    }
  } catch (err) {
    console.error('[solicitudes/id] Error reenviando email:', err)
    return NextResponse.json({ error: 'Error al reenviar' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}


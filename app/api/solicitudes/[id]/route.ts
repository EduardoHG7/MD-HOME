export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendMail, templateRespuestaSolicitud } from '@/lib/mail'

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
    },
    include: {
      evento: true,
      tarifa: true,
      solicitante: { select: { name: true, email: true } },
    },
  })

  // Notificar al solicitante si la solicitud fue aprobada o rechazada
  if ((estado === 'APROBADA' || estado === 'RECHAZADA') && session.user.email && solicitud.solicitante.email) {
    sendMail({
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
        adminNombre:       session.user.name ?? session.user.email,
      }),
    }).catch(err => console.error('[solicitudes/id] Error enviando email:', err))
  }

  return NextResponse.json(solicitud)
}

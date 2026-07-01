export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendWhatsApp } from '@/lib/whatsapp'

const include = {
  evento:      { select: { nombre: true } },
  solicitante: { select: { name: true, email: true, telefono: true } },
  aprobadoPor: { select: { name: true, email: true } },
  pagadoPor:   { select: { name: true, email: true } },
  facturas:    true,
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const caja = await prisma.cajaMenuda.findUnique({ where: { id: params.id }, include })
  if (!caja) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })
  if (session.user.role === 'USER' && caja.solicitanteId !== session.user.id) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }
  return NextResponse.json(caja)
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json()
  const { estado, montoAprobado, notaAdmin } = body

  const caja = await prisma.cajaMenuda.findUnique({ where: { id: params.id }, include })
  if (!caja) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })

  const isAdmin = session.user.role === 'ADMIN'
  const isContabilidad = session.user.role === 'CONTABILIDAD'
  const isOwner = caja.solicitanteId === session.user.id

  // Solo admin puede aprobar/rechazar
  if ((estado === 'APROBADA' || estado === 'RECHAZADA') && !isAdmin) {
    return NextResponse.json({ error: 'Solo admins pueden aprobar o rechazar' }, { status: 403 })
  }
  // Admin o contabilidad pueden marcar pagada
  if (estado === 'PAGADA' && !isAdmin && !isContabilidad) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }
  // El usuario puede cambiar a RESPALDOS_ENTREGADOS
  if (estado === 'RESPALDOS_ENTREGADOS' && !isOwner && !isAdmin) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }
  // Monto aprobado no puede ser 0
  if (montoAprobado !== undefined && montoAprobado <= 0) {
    return NextResponse.json({ error: 'El monto aprobado debe ser mayor a $0' }, { status: 400 })
  }

  const data: Record<string, unknown> = {}
  if (estado)          data.estado      = estado
  if (notaAdmin !== undefined) data.notaAdmin = notaAdmin ?? null
  if (montoAprobado)   data.montoAprobado = montoAprobado

  if (estado === 'APROBADA') {
    data.aprobadoPorId = session.user.id
    data.aprobadoEn    = new Date()
  }
  if (estado === 'PAGADA') {
    data.pagadoPorId = session.user.id
    data.pagadoEn    = new Date()
  }

  const updated = await prisma.cajaMenuda.update({ where: { id: params.id }, data, include })

  // Notificar al usuario cuando se aprueba o rechaza
  if (estado === 'APROBADA' || estado === 'RECHAZADA') {
    const emoji = estado === 'APROBADA' ? '✅' : '❌'
    const texto = estado === 'APROBADA' ? 'aprobada' : 'rechazada'
    if (updated.solicitante.telefono) {
      const lines = [
        `${emoji} *Magic Dreams — Caja Menuda ${texto}*`,
        ``,
        `*Evento:* ${updated.evento.nombre}`,
        `*Monto solicitado:* $${updated.montoSolicitado.toFixed(2)}`,
        ...(estado === 'APROBADA' && updated.montoAprobado
          ? [`*Monto aprobado:* $${updated.montoAprobado.toFixed(2)}`]
          : []),
        ...(notaAdmin ? [`*Nota:* ${notaAdmin}`] : []),
        ...(estado === 'APROBADA' ? [`\nYa puedes subir tus respaldos (facturas) en el sistema.`] : []),
      ]
      await sendWhatsApp(updated.solicitante.telefono, lines.join('\n')).catch(() => {})
    }
  }

  return NextResponse.json(updated)
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const caja = await prisma.cajaMenuda.findUnique({ where: { id: params.id } })
  if (!caja) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })

  const isAdmin = session.user.role === 'ADMIN'
  const isOwner = caja.solicitanteId === session.user.id
  if (!isAdmin && !isOwner) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  if (!isAdmin && caja.estado !== 'PENDIENTE') {
    return NextResponse.json({ error: 'Solo puedes eliminar solicitudes pendientes' }, { status: 400 })
  }

  await prisma.cajaMenuda.delete({ where: { id: params.id } })
  return NextResponse.json({ ok: true })
}

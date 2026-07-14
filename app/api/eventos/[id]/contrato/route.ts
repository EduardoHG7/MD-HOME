export const dynamic = 'force-dynamic'
export const maxDuration = 30

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { uploadToSharePoint } from '@/lib/sharepoint'
import { notificarExpedienteListo } from '@/lib/expediente'
import { sendMail, templateContratoPorFirmar } from '@/lib/mail'
import { CONTRATO_FROM, CONTRATO_DECO, CONTRATO_INFO } from '@/lib/contrato-notif'

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const contrato = await prisma.eventoContrato.findUnique({
    where: { eventoId: params.id },
    include: {
      subidoPor:  { select: { name: true, email: true } },
      firmadoPor: { select: { name: true, email: true } },
    },
  })
  return NextResponse.json(contrato)
}

// Subir el contrato del evento (PDF). Notifica a los admins para que lo firmen.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role === 'APLICANTE') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { base64, fileName } = await req.json()
  if (!base64 || !fileName) {
    return NextResponse.json({ error: 'Faltan datos del archivo' }, { status: 400 })
  }

  const evento = await prisma.evento.findUnique({ where: { id: params.id }, select: { nombre: true } })
  if (!evento) return NextResponse.json({ error: 'Evento no encontrado' }, { status: 404 })

  try {
    const buffer   = Buffer.from(base64, 'base64')
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path     = `EventoContratos/${params.id}/contrato-${Date.now()}-${safeName}`

    await uploadToSharePoint(path, buffer, 'application/pdf')

    // Re-subir un contrato reinicia el flujo de firma
    const contrato = await prisma.eventoContrato.upsert({
      where: { eventoId: params.id },
      create: {
        eventoId:      params.id,
        archivoPath:   path,
        archivoNombre: fileName,
        subidoPorId:   session.user.id,
      },
      update: {
        archivoPath:   path,
        archivoNombre: fileName,
        firmadoPath:   null,
        estado:        'PENDIENTE_FIRMA',
        subidoPorId:   session.user.id,
        firmadoPorId:  null,
        firmadoAt:     null,
      },
      include: {
        subidoPor:  { select: { name: true, email: true } },
        firmadoPor: { select: { name: true, email: true } },
      },
    })

    // Aviso por correo a quien firma (deco) y a info@panatickets.com
    const appUrl = process.env.NEXTAUTH_URL ?? ''
    try {
      await sendMail({
        fromEmail: CONTRATO_FROM,
        toEmails:  [CONTRATO_DECO, CONTRATO_INFO],
        subject:   `Contrato nuevo por firmar — ${evento.nombre}`,
        html: templateContratoPorFirmar({
          eventoNombre: evento.nombre,
          subidoPor:    session.user.name ?? session.user.email ?? '—',
          url:          `${appUrl}/admin/eventos/${params.id}/documentos`,
        }),
      })
    } catch (e) {
      console.error('[contrato] Error enviando correo de contrato subido:', e)
    }

    await notificarExpedienteListo(params.id)

    return NextResponse.json(contrato, { status: 201 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error al subir contrato'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
  }

  await prisma.eventoContrato.delete({ where: { eventoId: params.id } })
  return NextResponse.json({ ok: true })
}

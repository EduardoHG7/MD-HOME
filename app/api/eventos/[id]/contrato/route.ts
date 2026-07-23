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
import { puedeGestionarExpediente } from '@/lib/expediente-permisos'

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
// El PDF viaja como body binario (no base64 en JSON): los contratos escaneados/
// firmados pesan varios MB, y el +33% de codificar en base64 los hacía chocar
// con el límite de tamaño de la función serverless.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role === 'APLICANTE') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const fileName = req.headers.get('x-file-name')
  if (!fileName) {
    return NextResponse.json({ error: 'Falta el nombre del archivo' }, { status: 400 })
  }

  const evento = await prisma.evento.findUnique({ where: { id: params.id }, select: { nombre: true } })
  if (!evento) return NextResponse.json({ error: 'Evento no encontrado' }, { status: 404 })

  try {
    const buffer   = Buffer.from(await req.arrayBuffer())
    if (buffer.length === 0) {
      return NextResponse.json({ error: 'El archivo llegó vacío' }, { status: 400 })
    }
    const nombreOriginal = decodeURIComponent(fileName)
    const safeName        = nombreOriginal.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path             = `EventoContratos/${params.id}/contrato-${Date.now()}-${safeName}`

    await uploadToSharePoint(path, buffer, 'application/pdf')

    // Re-subir un contrato reinicia el flujo de firma
    const contrato = await prisma.eventoContrato.upsert({
      where: { eventoId: params.id },
      create: {
        eventoId:      params.id,
        archivoPath:   path,
        archivoNombre: nombreOriginal,
        subidoPorId:   session.user.id,
      },
      update: {
        archivoPath:   path,
        archivoNombre: nombreOriginal,
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

// Eliminar el contrato del evento. Un contrato pendiente de firma lo puede
// borrar cualquiera que gestione el expediente (admin o usuario/operador
// Panatickets); uno ya FIRMADO — documento legal ejecutado — solo el admin.
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const contrato = await prisma.eventoContrato.findUnique({
    where: { eventoId: params.id },
    select: { estado: true },
  })
  if (!contrato) return NextResponse.json({ error: 'No hay contrato para eliminar' }, { status: 404 })

  const esAdmin = session.user.role === 'ADMIN'
  if (contrato.estado === 'FIRMADO' && !esAdmin) {
    return NextResponse.json({ error: 'Solo el administrador puede eliminar un contrato ya firmado' }, { status: 403 })
  }
  if (!esAdmin && !(await puedeGestionarExpediente(params.id, session.user.id, session.user.role, session.user.email))) {
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
  }

  await prisma.eventoContrato.delete({ where: { eventoId: params.id } })
  return NextResponse.json({ ok: true })
}

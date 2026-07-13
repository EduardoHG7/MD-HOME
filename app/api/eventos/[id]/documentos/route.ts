export const dynamic = 'force-dynamic'
export const maxDuration = 30

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { uploadToSharePoint } from '@/lib/sharepoint'
import { notificarExpedienteListo } from '@/lib/expediente'
import { esOperadorPanatickets } from '@/lib/permisos'

const TIPOS_VALIDOS = [
  'CONTRATO', 'SEGURO', 'FIANZA', 'PERMISO', 'OTRO',
  // Checklist de documentos por evento (Panatickets)
  'AVISO_OPERACIONES', 'CEDULA_REP_LEGAL', 'CIERRE', 'GASTOS', 'PLANILLA',
]

async function puedeGestionar(eventoId: string, userId: string, role: string, email?: string | null) {
  if (role === 'ADMIN') return true
  const evento = await prisma.evento.findUnique({
    where: { id: eventoId },
    select: {
      docsResponsableId: true,
      tenants: { select: { tenant: { select: { id: true, slug: true } } } },
    },
  })
  if (!evento) return false
  if (evento.docsResponsableId === userId) return true

  // Solo aplica al expediente de eventos Panatickets
  const pana = evento.tenants.find(t => t.tenant.slug === 'panatickets')
  if (!pana) return false

  // Operador Panatickets identificado por correo @panatickets.com…
  if (esOperadorPanatickets(email, role)) return true
  // …o cualquier usuario que sea miembro de la empresa Panatickets
  const pertenece = await prisma.userTenant.findUnique({
    where: { userId_tenantId: { userId, tenantId: pana.tenant.id } },
  })
  return Boolean(pertenece)
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const documentos = await prisma.eventoDocumento.findMany({
    where: { eventoId: params.id },
    include: { subidoPor: { select: { name: true, email: true } } },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(documentos)
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  if (!(await puedeGestionar(params.id, session.user.id, session.user.role, session.user.email))) {
    return NextResponse.json({ error: 'No eres el responsable de documentación de este evento' }, { status: 403 })
  }

  const { tipo, nombre, base64, mimeType, fileName } = await req.json()
  if (!tipo || !base64 || !mimeType || !fileName) {
    return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 })
  }
  if (!TIPOS_VALIDOS.includes(tipo)) {
    return NextResponse.json({ error: 'Tipo de documento inválido' }, { status: 400 })
  }

  const allowedMimes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
  if (!allowedMimes.includes(mimeType)) {
    return NextResponse.json({ error: 'Formato no permitido (PDF, imagen o Word)' }, { status: 400 })
  }

  try {
    const buffer = Buffer.from(base64, 'base64')
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `EventoDocumentos/${params.id}/${tipo}-${Date.now()}-${safeName}`

    await uploadToSharePoint(path, buffer, mimeType)

    const doc = await prisma.eventoDocumento.create({
      data: {
        eventoId:      params.id,
        tipo,
        nombre:        nombre || null,
        archivoPath:   path,
        archivoNombre: fileName,
        subidoPorId:   session.user.id,
      },
      include: { subidoPor: { select: { name: true, email: true } } },
    })
    await notificarExpedienteListo(params.id)
    return NextResponse.json(doc, { status: 201 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error al subir documento'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  if (!(await puedeGestionar(params.id, session.user.id, session.user.role, session.user.email))) {
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
  }

  const { documentoId } = await req.json()
  await prisma.eventoDocumento.delete({ where: { id: documentoId } })
  return NextResponse.json({ ok: true })
}

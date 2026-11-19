export const dynamic = 'force-dynamic'
export const maxDuration = 30

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { uploadToSharePoint } from '@/lib/sharepoint'
import { notificarExpedienteListo } from '@/lib/expediente'
import { puedeGestionarExpediente } from '@/lib/expediente-permisos'
import { getActiveTenantId } from '@/lib/tenant'

const TIPOS_VALIDOS = [
  'CONTRATO', 'SEGURO', 'FIANZA', 'PERMISO', 'OTRO',
  // Checklist de documentos por evento (Panatickets)
  'AVISO_OPERACIONES', 'CEDULA_REP_LEGAL', 'CIERRE', 'GASTOS', 'PLANILLA', 'LOGISTICA',
]

// Los documentos legales del evento (contrato, seguro, fianza, etc.) son de
// la empresa dueña del evento — Print Media no debe verlos, ni en eventos
// que se le compartieron para el Cotizador PM.
async function tenantBloqueado() {
  const tenantId = getActiveTenantId()
  if (!tenantId) return false
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } })
  return tenant?.slug === 'printmediapty'
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (await tenantBloqueado()) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

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
  if (await tenantBloqueado()) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  if (!(await puedeGestionarExpediente(params.id, session.user.id, session.user.role, session.user.availableTenants))) {
    return NextResponse.json({ error: 'No eres el responsable de documentación de este evento' }, { status: 403 })
  }

  // El archivo puede llegar como body binario (lo que usa el expediente) o
  // como base64 en JSON (formato anterior). El binario evita el +33% de peso
  // del base64, que hacía que documentos escaneados de ~3.4 MB o más chocaran
  // con el límite de 4.5 MB de Vercel y el navegador solo viera "Error de
  // conexión".
  let tipo: string | null, nombre: string | null, mimeType: string | null, fileName: string | null
  let buffer: Buffer
  const contentType = (req.headers.get('content-type') ?? '').split(';')[0].trim()
  if (contentType === 'application/json') {
    const body = await req.json()
    tipo = body.tipo; nombre = body.nombre ?? null; mimeType = body.mimeType; fileName = body.fileName
    buffer = Buffer.from(body.base64 ?? '', 'base64')
  } else {
    tipo     = req.headers.get('x-doc-tipo')
    nombre   = null
    mimeType = contentType || null
    const nombreHeader = req.headers.get('x-file-name')
    fileName = nombreHeader ? decodeURIComponent(nombreHeader) : null
    buffer   = Buffer.from(await req.arrayBuffer())
  }
  if (!tipo || !mimeType || !fileName || buffer.length === 0) {
    return NextResponse.json({ error: 'Faltan campos requeridos o el archivo llegó vacío' }, { status: 400 })
  }
  if (!TIPOS_VALIDOS.includes(tipo)) {
    return NextResponse.json({ error: 'Tipo de documento inválido' }, { status: 400 })
  }

  const allowedMimes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
  if (!allowedMimes.includes(mimeType)) {
    return NextResponse.json({ error: 'Formato no permitido (PDF, imagen JPG/PNG/WEBP o Word)' }, { status: 400 })
  }

  try {
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
  if (await tenantBloqueado()) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  if (!(await puedeGestionarExpediente(params.id, session.user.id, session.user.role, session.user.availableTenants))) {
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
  }

  const { documentoId } = await req.json()
  await prisma.eventoDocumento.delete({ where: { id: documentoId } })
  return NextResponse.json({ ok: true })
}

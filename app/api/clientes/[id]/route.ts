export const dynamic = 'force-dynamic'
export const maxDuration = 30

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getActiveTenantId } from '@/lib/tenant'
import { uploadToSharePoint } from '@/lib/sharepoint'

const TENANT_SLUG = 'printmediapty'

async function tenantAutorizado() {
  const tenantId = getActiveTenantId()
  const tenant = tenantId ? await prisma.tenant.findUnique({ where: { id: tenantId } }) : null
  return tenant?.slug === TENANT_SLUG ? tenantId : null
}

const ALLOWED_MIMES = [
  'application/pdf', 'image/jpeg', 'image/png', 'image/webp',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]

type ArchivoPayload = { base64: string; mimeType: string; fileName: string } | null | undefined

async function subirArchivo(archivo: ArchivoPayload, carpeta: string): Promise<{ path: string; nombre: string } | null> {
  if (!archivo?.base64 || !archivo?.mimeType || !archivo?.fileName) return null
  if (!ALLOWED_MIMES.includes(archivo.mimeType)) {
    throw new Error('Formato de archivo no permitido (PDF, Word o imagen)')
  }
  const buffer = Buffer.from(archivo.base64, 'base64')
  const safeName = archivo.fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${carpeta}/${Date.now()}-${safeName}`
  await uploadToSharePoint(path, buffer, archivo.mimeType)
  return { path, nombre: archivo.fileName }
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  if (!(await tenantAutorizado())) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const {
    nombreEmpresa, rucDv, nombreRepresentanteLegal, nombreContacto,
    telefono, correo, direccion, avisoOperaciones, cedulaRep,
  } = await req.json()

  let archivosData: Partial<{
    avisoOperacionesPath: string; avisoOperacionesNombre: string
    cedulaRepPath: string; cedulaRepNombre: string
  }> = {}

  try {
    const aviso = await subirArchivo(avisoOperaciones, 'ClientesDocs/AvisoOperaciones')
    if (aviso) archivosData = { ...archivosData, avisoOperacionesPath: aviso.path, avisoOperacionesNombre: aviso.nombre }
    const cedula = await subirArchivo(cedulaRep, 'ClientesDocs/CedulaRepresentante')
    if (cedula) archivosData = { ...archivosData, cedulaRepPath: cedula.path, cedulaRepNombre: cedula.nombre }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error al subir archivo'
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  const cliente = await prisma.cliente.update({
    where: { id: params.id },
    data: {
      nombreEmpresa, rucDv, nombreRepresentanteLegal, nombreContacto,
      telefono, correo, direccion,
      ...archivosData,
    },
  })
  return NextResponse.json(cliente)
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  if (!(await tenantAutorizado())) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  await prisma.cliente.update({ where: { id: params.id }, data: { activo: false } })
  return NextResponse.json({ ok: true })
}

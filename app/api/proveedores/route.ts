export const dynamic = 'force-dynamic'
export const maxDuration = 30

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getActiveTenantId } from '@/lib/tenant'
import { uploadToSharePoint } from '@/lib/sharepoint'

// Registro de proveedores — exclusivo del tenant "printmediapty" (Print
// Media PTY), no aplica a las demás empresas.
const TENANT_SLUG = 'printmediapty'

async function tenantAutorizado() {
  const tenantId = getActiveTenantId()
  const tenant = tenantId ? await prisma.tenant.findUnique({ where: { id: tenantId } }) : null
  return tenant?.slug === TENANT_SLUG ? tenantId : null
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const tenantId = await tenantAutorizado()
  if (!tenantId) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const proveedores = await prisma.proveedor.findMany({
    where: { activo: true, tenantId },
    orderBy: { nombreEmpresa: 'asc' },
  })
  return NextResponse.json(proveedores)
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

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const tenantId = await tenantAutorizado()
  if (!tenantId) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const {
    nombreEmpresa, rucDv, nombreRepresentanteLegal, nombreContacto,
    telefono, correo, direccion, avisoOperaciones, cedulaRep,
    nombreBanco, tipoCuenta, numeroCuenta,
  } = await req.json()

  const requeridos = {
    nombreEmpresa, rucDv, nombreRepresentanteLegal, nombreContacto,
    telefono, correo, direccion, nombreBanco, tipoCuenta, numeroCuenta,
  }
  const faltante = Object.entries(requeridos).find(([, v]) => !String(v ?? '').trim())
  if (faltante) return NextResponse.json({ error: `Falta el campo "${faltante[0]}"` }, { status: 400 })

  let avisoOperacionesPath: string | null = null
  let avisoOperacionesNombre: string | null = null
  let cedulaRepPath: string | null = null
  let cedulaRepNombre: string | null = null

  try {
    const aviso = await subirArchivo(avisoOperaciones, 'ProveedoresDocs/AvisoOperaciones')
    if (aviso) { avisoOperacionesPath = aviso.path; avisoOperacionesNombre = aviso.nombre }
    const cedula = await subirArchivo(cedulaRep, 'ProveedoresDocs/CedulaRepresentante')
    if (cedula) { cedulaRepPath = cedula.path; cedulaRepNombre = cedula.nombre }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error al subir archivo'
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  const proveedor = await prisma.proveedor.create({
    data: {
      tenantId,
      nombreEmpresa: nombreEmpresa.trim(),
      rucDv: rucDv.trim(),
      nombreRepresentanteLegal: nombreRepresentanteLegal.trim(),
      nombreContacto: nombreContacto.trim(),
      telefono: telefono.trim(),
      correo: correo.trim(),
      direccion: direccion.trim(),
      nombreBanco: nombreBanco.trim(),
      tipoCuenta: tipoCuenta.trim(),
      numeroCuenta: numeroCuenta.trim(),
      avisoOperacionesPath, avisoOperacionesNombre,
      cedulaRepPath, cedulaRepNombre,
    },
  })
  return NextResponse.json(proveedor, { status: 201 })
}

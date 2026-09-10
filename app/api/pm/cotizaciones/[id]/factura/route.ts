export const dynamic = 'force-dynamic'
export const maxDuration = 30

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getActiveTenantId } from '@/lib/tenant'
import { uploadToSharePoint } from '@/lib/sharepoint'
import { puedeAprobar } from '@/lib/aprobaciones'
import { cotizacionPMInclude } from '@/lib/cotizacionesPMInclude'

const TENANT_SLUG = 'printmediapty'

async function tenantAutorizado() {
  const tenantId = getActiveTenantId()
  const tenant = tenantId ? await prisma.tenant.findUnique({ where: { id: tenantId } }) : null
  return tenant?.slug === TENANT_SLUG ? tenantId : null
}

const ALLOWED_MIMES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']

// Sube la factura emitida al cliente para una cotización ya aprobada — la
// carga contabilidad como respaldo, sin flujo de aprobación propio.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const tenantId = await tenantAutorizado()
  if (!tenantId) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  if (!(await puedeAprobar([tenantId], session.user))) {
    return NextResponse.json({ error: 'No autorizado para cargar la factura' }, { status: 403 })
  }

  const existente = await prisma.cotizacionPM.findUnique({ where: { id: params.id } })
  if (!existente) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })
  if (existente.estado !== 'APROBADA') {
    return NextResponse.json({ error: 'La cotización debe estar aprobada para cargar la factura' }, { status: 400 })
  }

  const { numeroFactura, archivo } = await req.json() as {
    numeroFactura?: string
    archivo?: { base64: string; mimeType: string; fileName: string } | null
  }
  if (!archivo?.base64 || !archivo?.mimeType || !archivo?.fileName) {
    return NextResponse.json({ error: 'Adjunta el archivo de la factura' }, { status: 400 })
  }
  if (!ALLOWED_MIMES.includes(archivo.mimeType)) {
    return NextResponse.json({ error: 'Formato de archivo no permitido (PDF o imagen)' }, { status: 400 })
  }

  const buffer = Buffer.from(archivo.base64, 'base64')
  const safeName = archivo.fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
  const archivoPath = `CotizacionesPM/Facturas/${Date.now()}-${safeName}`
  await uploadToSharePoint(archivoPath, buffer, archivo.mimeType)

  const cot = await prisma.cotizacionPM.update({
    where: { id: params.id },
    data: {
      facturaNumero: numeroFactura?.trim() || null,
      facturaArchivoNombre: archivo.fileName,
      facturaArchivoPath: archivoPath,
      facturaSubidaPorId: session.user.id,
      facturaSubidaEn: new Date(),
    },
    include: cotizacionPMInclude,
  })

  return NextResponse.json(cot)
}

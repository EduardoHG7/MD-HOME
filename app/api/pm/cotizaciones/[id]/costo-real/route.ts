export const dynamic = 'force-dynamic'
export const maxDuration = 30

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getActiveTenantId } from '@/lib/tenant'
import { uploadToSharePoint } from '@/lib/sharepoint'
import { sendMail, templateNuevoCostoRealPM } from '@/lib/mail'
import { receptoresSolicitud } from '@/lib/aprobaciones'

const TENANT_SLUG = 'printmediapty'
const DOMINIO_ADMIN_PM = '@printmediapty.com'

async function tenantAutorizado() {
  const tenantId = getActiveTenantId()
  const tenant = tenantId ? await prisma.tenant.findUnique({ where: { id: tenantId } }) : null
  return tenant?.slug === TENANT_SLUG ? tenantId : null
}

const ALLOWED_MIMES = [
  'application/pdf', 'image/jpeg', 'image/png', 'image/webp',
]

interface FacturaInput {
  descripcion?: string
  proveedor?: string
  monto?: number
  archivo?: { base64: string; mimeType: string; fileName: string } | null
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const tenantId = await tenantAutorizado()
  if (!tenantId) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const existente = await prisma.cotizacionPM.findUnique({ where: { id: params.id } })
  if (!existente) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })
  if (session.user.role !== 'ADMIN' && existente.creadoPorId !== session.user.id) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }
  if (existente.estado !== 'APROBADA') {
    return NextResponse.json({ error: 'La cotización debe estar aprobada para subir el costo real' }, { status: 400 })
  }

  const { costoRealTotal, facturas } = await req.json() as { costoRealTotal: number; facturas: FacturaInput[] }
  if (!costoRealTotal || Number(costoRealTotal) <= 0) {
    return NextResponse.json({ error: 'Ingresa el monto real' }, { status: 400 })
  }

  const facturasData: { descripcion: string | null; proveedor: string | null; monto: number; archivoNombre: string | null; archivoPath: string | null }[] = []
  for (const f of facturas ?? []) {
    let archivoPath: string | null = null
    let archivoNombre: string | null = null
    if (f.archivo?.base64 && f.archivo?.mimeType && f.archivo?.fileName) {
      if (!ALLOWED_MIMES.includes(f.archivo.mimeType)) {
        return NextResponse.json({ error: 'Formato de archivo no permitido (PDF o imagen)' }, { status: 400 })
      }
      const buffer = Buffer.from(f.archivo.base64, 'base64')
      const safeName = f.archivo.fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
      archivoPath = `CotizacionesPM/CostosReales/${Date.now()}-${safeName}`
      await uploadToSharePoint(archivoPath, buffer, f.archivo.mimeType)
      archivoNombre = f.archivo.fileName
    }
    facturasData.push({
      descripcion: f.descripcion?.trim() || null,
      proveedor: f.proveedor?.trim() || null,
      monto: Number(f.monto) || 0,
      archivoNombre, archivoPath,
    })
  }

  const cot = await prisma.cotizacionPM.update({
    where: { id: params.id },
    data: {
      costoRealTotal: Number(costoRealTotal),
      costoRealEstado: 'PENDIENTE',
      costoRealNotaAdmin: null,
      costoRealAprobadoPorId: null,
      costoRealAprobadoEn: null,
      costoRealSubidoEn: new Date(),
      facturasCostoReal: { deleteMany: {}, create: facturasData },
    },
    include: { creadoPor: { select: { name: true, email: true } }, facturasCostoReal: true },
  })

  try {
    const admins = await receptoresSolicitud([tenantId], () => prisma.user.findMany({
      where: { role: 'ADMIN', tenants: { some: { tenantId } }, email: { endsWith: DOMINIO_ADMIN_PM } },
      select: { id: true, name: true, email: true, telefono: true },
    }))
    const adminEmails = admins.map(a => a.email)
    const fromEmail = session.user.email
    if (adminEmails.length && fromEmail) {
      await sendMail({
        fromEmail,
        toEmails: adminEmails,
        subject: `Costo real para aprobación — ${cot.nombreTrabajo} · ${cot.clienteNombre}`,
        html: templateNuevoCostoRealPM({
          usuarioNombre:  session.user.name ?? fromEmail,
          usuarioEmail:   fromEmail,
          nombreTrabajo:  cot.nombreTrabajo,
          clienteNombre:  cot.clienteNombre,
          costoRealTotal: cot.costoRealTotal ?? 0,
          cotizacionId:   cot.id,
        }),
      })
    }
  } catch (err) {
    console.error('[cotizaciones-pm] Error enviando notificación de costo real:', err)
  }

  return NextResponse.json(cot)
}

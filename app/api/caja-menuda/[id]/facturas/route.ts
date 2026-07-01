export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { uploadToSharePoint } from '@/lib/sharepoint'

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const caja = await prisma.cajaMenuda.findUnique({ where: { id: params.id } })
  if (!caja) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })
  if (caja.solicitanteId !== session.user.id && session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }
  if (caja.estado !== 'APROBADA' && caja.estado !== 'RESPALDOS_ENTREGADOS') {
    return NextResponse.json({ error: 'La caja menuda debe estar aprobada para subir respaldos' }, { status: 400 })
  }

  const { base64, mimeType, fileName, descripcion, proveedor, numeroFactura, rucDv, fechaEmision, subtotal, itbms, total } = await req.json()
  if (!base64 || !mimeType) return NextResponse.json({ error: 'Faltan datos del archivo' }, { status: 400 })

  const ext  = fileName?.split('.').pop() ?? (mimeType === 'application/pdf' ? 'pdf' : 'jpg')
  const safe = fileName?.replace(/[^a-zA-Z0-9._-]/g, '_') ?? `factura_${Date.now()}.${ext}`
  const path = `CajaMenuda/${params.id}/${Date.now()}_${safe}`

  const buffer = Buffer.from(base64, 'base64')
  await uploadToSharePoint(path, buffer, mimeType)

  const factura = await prisma.facturaCajaMenuda.create({
    data: {
      cajaMenudaId: params.id,
      descripcion:  descripcion  ?? null,
      proveedor:    proveedor    ?? null,
      numeroFactura: numeroFactura ?? null,
      rucDv:        rucDv        ?? null,
      fechaEmision: fechaEmision ?? null,
      subtotal:     subtotal     ?? 0,
      itbms:        itbms        ?? 0,
      total:        total        ?? 0,
      archivoNombre: safe,
      archivoPath:   path,
    },
  })

  return NextResponse.json(factura, { status: 201 })
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const facturas = await prisma.facturaCajaMenuda.findMany({
    where: { cajaMenudaId: params.id },
    orderBy: { createdAt: 'asc' },
  })
  return NextResponse.json(facturas)
}

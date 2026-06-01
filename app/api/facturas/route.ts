export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const facturas = await prisma.factura.findMany({
    include: { evento: true },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(facturas)
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const data = await req.json()
  const { eventoId, responsable, items } = data

  if (!items?.length) {
    return NextResponse.json({ error: 'No hay facturas para guardar' }, { status: 400 })
  }

  const created = await prisma.factura.createMany({
    data: items.map((item: Record<string, unknown>) => ({
      eventoId:      eventoId || null,
      creadoPorId:   session.user.id,
      responsable:   responsable || session.user.name || session.user.email!,
      numeroFactura: item.numeroFactura as string || null,
      proveedor:     item.proveedor as string || null,
      rucDv:         item.rucDv as string || null,
      descripcion:   item.descripcion as string || null,
      fechaEmision:  item.fechaEmision as string || null,
      fechaPago:     item.fechaPago as string || null,
      subtotal:      Number(item.subtotal) || 0,
      itbms:         Number(item.itbms) || 0,
      total:         Number(item.total) || 0,
      archivoNombre: item.archivoNombre as string || null,
    })),
  })

  return NextResponse.json({ guardadas: created.count }, { status: 201 })
}

export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  // Admin ve todas, usuario solo las suyas
  const where = session.user.role === 'ADMIN' ? {} : { creadoPorId: session.user.id }

  const facturas = await prisma.factura.findMany({
    where,
    include: { evento: true },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(facturas)
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { eventoId, responsable, tipoPago, items } = await req.json()

  if (!items?.length) {
    return NextResponse.json({ error: 'No hay facturas para guardar' }, { status: 400 })
  }

  const created = await prisma.factura.createMany({
    data: items.map((item: Record<string, unknown>) => ({
      eventoId:      eventoId || null,
      creadoPorId:   session.user.id,
      responsable:   responsable || session.user.name || session.user.email!,
      numeroFactura: item.numeroFactura as string || null,
      proveedor:     item.proveedor     as string || null,
      rucDv:         item.rucDv         as string || null,
      descripcion:   item.descripcion   as string || null,
      fechaEmision:  item.fechaEmision  as string || null,
      fechaPago:     item.fechaPago     as string || null,
      subtotal:      Number(item.subtotal) || 0,
      itbms:         Number(item.itbms)    || 0,
      total:         Number(item.total)    || 0,
      archivoNombre: item.archivoNombre as string || null,
      tipoPago:      tipoPago || null,
    })),
  })

  return NextResponse.json({ guardadas: created.count }, { status: 201 })
}

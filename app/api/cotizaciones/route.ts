export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET: cotizaciones del usuario o todas si es admin
export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const lineaId = searchParams.get('lineaId')

  const where = session.user.role === 'ADMIN'
    ? (lineaId ? { lineaId } : {})
    : { creadoPorId: session.user.id, ...(lineaId ? { lineaId } : {}) }

  const cotizaciones = await prisma.cotizacion.findMany({
    where,
    include: {
      facturas:   true,
      creadoPor:  { select: { name: true, email: true } },
      linea: {
        include: {
          categoria: {
            include: { presupuesto: { include: { evento: { select: { nombre: true, id: true } } } } }
          }
        }
      },
    },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(cotizaciones)
}

// POST: crear cotización
export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { lineaId, descripcion, facturas } = await req.json()
  if (!lineaId || !facturas?.length) {
    return NextResponse.json({ error: 'Faltan datos requeridos' }, { status: 400 })
  }

  const montoTotal = facturas.reduce((s: number, f: { monto: number }) => s + (f.monto ?? 0), 0)

  const cot = await prisma.cotizacion.create({
    data: {
      lineaId,
      creadoPorId: session.user.id,
      descripcion: descripcion ?? null,
      montoTotal,
      facturas: {
        create: facturas.map((f: { descripcion: string; proveedor?: string; monto: number; archivoNombre?: string }) => ({
          descripcion:   f.descripcion,
          proveedor:     f.proveedor     ?? null,
          monto:         f.monto         ?? 0,
          archivoNombre: f.archivoNombre ?? null,
        })),
      },
    },
    include: { facturas: true, creadoPor: { select: { name: true, email: true } } },
  })
  return NextResponse.json(cot, { status: 201 })
}

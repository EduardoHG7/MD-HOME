export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Info pública (protegida solo por lo impredecible del token) que usa la
// pantalla kiosko para mostrar el nombre del punto y el historial reciente
// al cargar, antes de que lleguen boletos nuevos por SSE.
export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  const punto = await prisma.punto.findUnique({
    where: { token: params.token },
    include: {
      boletos: {
        orderBy: { createdAt: 'desc' },
        take: 20,
      },
    },
  })
  if (!punto || !punto.activo) {
    return new NextResponse('Punto no encontrado o inactivo', { status: 404 })
  }

  return NextResponse.json({
    nombre: punto.nombre,
    boletos: punto.boletos.map((b) => ({
      id: b.id,
      codigo: b.codigo,
      nombre: b.nombre,
      apellido: b.apellido,
      evento: b.evento,
      fecha: b.fecha,
      extra: b.extra ? JSON.parse(b.extra) : {},
      estado: b.estado,
      createdAt: b.createdAt.toISOString(),
    })),
  })
}

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { ingestScan } from '@/lib/ingest'

// Simula un escaneo válido de CodeREADr para poder probar la impresora de
// un punto sin depender de un boleto real.
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const punto = await prisma.punto.findUnique({ where: { id: params.id } })
  if (!punto) return new NextResponse('Punto no encontrado', { status: 404 })

  const hoy = new Date().toLocaleDateString('es-PA')
  const boleto = await ingestScan(punto.id, punto.token, {
    nombre: 'Boleto',
    apellido: 'de Prueba',
    evento: `Prueba en ${punto.nombre}`,
    fecha: hoy,
    codigo: `TEST-${Date.now()}`,
    valid: 'true',
  })

  return NextResponse.json(boleto)
}

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getMapping, saveMapping, EMPTY_MAPPING } from '@/lib/mapping'

// Devuelve el mapeo guardado + el último payload crudo recibido (de
// cualquier punto) para que el admin pueda ver qué llaves manda realmente
// CodeREADr y así mapearlas sin tener que adivinar su documentación.
export async function GET() {
  const mapping = await getMapping()
  const ultimo = await prisma.boleto.findFirst({ orderBy: { createdAt: 'desc' } })
  return NextResponse.json({
    mapping,
    ultimoPayload: ultimo ? JSON.parse(ultimo.raw) : null,
    ultimoRecibidoEn: ultimo?.createdAt.toISOString() ?? null,
  })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const mapping = {
    nombre: typeof body.nombre === 'string' ? body.nombre : EMPTY_MAPPING.nombre,
    apellido: typeof body.apellido === 'string' ? body.apellido : EMPTY_MAPPING.apellido,
    evento: typeof body.evento === 'string' ? body.evento : EMPTY_MAPPING.evento,
    fecha: typeof body.fecha === 'string' ? body.fecha : EMPTY_MAPPING.fecha,
    codigo: typeof body.codigo === 'string' ? body.codigo : EMPTY_MAPPING.codigo,
  }
  await saveMapping(mapping)
  return NextResponse.json({ ok: true })
}

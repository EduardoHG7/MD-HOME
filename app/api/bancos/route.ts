export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { BANCOS_PANAMA } from '@/lib/bancos'

const ordenar = (lista: string[]) => lista.sort((a, b) => a.localeCompare(b, 'es'))

// Lista de bancos: los panameños fijos + los agregados por usuarios
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const extra = await prisma.banco.findMany({ select: { nombre: true } })
  const nombres = new Set(BANCOS_PANAMA)
  for (const b of extra) nombres.add(b.nombre)
  return NextResponse.json(ordenar(Array.from(nombres)))
}

// Agrega un banco nuevo (si ya existe, con otras mayúsculas, devuelve el existente)
export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role === 'APLICANTE') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { nombre } = await req.json()
  const limpio = typeof nombre === 'string' ? nombre.trim().replace(/\s+/g, ' ') : ''
  if (!limpio) return NextResponse.json({ error: 'Escribe el nombre del banco' }, { status: 400 })
  if (limpio.length > 80) return NextResponse.json({ error: 'Nombre demasiado largo' }, { status: 400 })

  const fijo = BANCOS_PANAMA.find(b => b.toLowerCase() === limpio.toLowerCase())
  if (fijo) return NextResponse.json({ nombre: fijo })

  const existente = await prisma.banco.findFirst({
    where: { nombre: { equals: limpio, mode: 'insensitive' } },
  })
  if (existente) return NextResponse.json({ nombre: existente.nombre })

  const banco = await prisma.banco.create({ data: { nombre: limpio } })
  return NextResponse.json({ nombre: banco.nombre }, { status: 201 })
}

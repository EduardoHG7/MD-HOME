export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { notificarExpedienteListo } from '@/lib/expediente'

const CAMPOS = [
  'razonSocial', 'nombreComercial', 'rucDv', 'direccion', 'provincia',
  'distrito', 'corregimiento', 'telefonos', 'organizacion', 'correoEnvio',
] as const

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const formulario = await prisma.formularioComprobantes.findUnique({
    where: { eventoId: params.id },
  })
  return NextResponse.json(formulario)
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role === 'APLICANTE') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const body = await req.json()
  const data: Record<string, string | null> = {}
  for (const campo of CAMPOS) {
    if (campo in body) data[campo] = body[campo] ? String(body[campo]) : null
  }

  const formulario = await prisma.formularioComprobantes.upsert({
    where:  { eventoId: params.id },
    create: { eventoId: params.id, ...data },
    update: data,
  })
  await notificarExpedienteListo(params.id)
  return NextResponse.json(formulario)
}

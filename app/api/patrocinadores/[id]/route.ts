export const dynamic = 'force-dynamic'
export const maxDuration = 30

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { uploadToSharePoint } from '@/lib/sharepoint'

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const { nombre, categoria, contrato } = await req.json()

  let contratoData: { contratoPath: string; contratoNombre: string } | {} = {}

  if (contrato?.base64 && contrato?.mimeType && contrato?.fileName) {
    const allowedMimes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp',
      'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
    if (!allowedMimes.includes(contrato.mimeType)) {
      return NextResponse.json({ error: 'Formato de contrato no permitido (PDF, Word o imagen)' }, { status: 400 })
    }
    try {
      const buffer   = Buffer.from(contrato.base64, 'base64')
      const safeName = contrato.fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
      const path     = `PatrocinadorContratos/${Date.now()}-${safeName}`
      await uploadToSharePoint(path, buffer, contrato.mimeType)
      contratoData = { contratoPath: path, contratoNombre: contrato.fileName }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al subir contrato'
      return NextResponse.json({ error: msg }, { status: 500 })
    }
  }

  const p = await prisma.patrocinador.update({
    where: { id: params.id },
    data: { nombre, categoria: categoria ?? null, ...contratoData },
  })
  return NextResponse.json(p)
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  await prisma.patrocinador.update({ where: { id: params.id }, data: { activo: false } })
  return NextResponse.json({ ok: true })
}

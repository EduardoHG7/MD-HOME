export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { uploadToSharePoint } from '@/lib/sharepoint'

// POST: subir el PDF/imagen de la cotización al crearla
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const cot = await prisma.cotizacion.findUnique({ where: { id: params.id }, select: { creadoPorId: true } })
  if (!cot) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })
  if (cot.creadoPorId !== session.user.id && session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const { base64, mimeType, fileName } = await req.json()
  if (!base64 || !mimeType) return NextResponse.json({ error: 'Faltan datos' }, { status: 400 })

  const ext  = mimeType.split('/')[1]?.replace('jpeg','jpg') ?? 'pdf'
  const path = `Cotizaciones/${params.id}/cotizacion.${ext}`
  await uploadToSharePoint(path, Buffer.from(base64, 'base64'), mimeType)
  const archivoUrl = `/api/fotos?path=${encodeURIComponent(path)}`

  await prisma.cotizacion.update({
    where: { id: params.id },
    data: { archivoUrl, archivoNombreCot: fileName ?? null },
  })

  return NextResponse.json({ archivoUrl })
}

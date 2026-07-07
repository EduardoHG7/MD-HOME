export const dynamic = 'force-dynamic'
export const maxDuration = 30

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getActiveTenantId } from '@/lib/tenant'
import { uploadToSharePoint } from '@/lib/sharepoint'

export async function GET() {
  const tenantId = getActiveTenantId()

  const patrocinadores = await prisma.patrocinador.findMany({
    where: { activo: true, ...(tenantId ? { tenantId } : {}) },
    orderBy: { nombre: 'asc' },
    include: {
      patrocinios: {
        include: {
          presupuesto: {
            include: { evento: { select: { nombre: true, fechaInicio: true } } },
          },
        },
      },
    },
  })
  return NextResponse.json(patrocinadores)
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const tenantId = getActiveTenantId()
  const { nombre, categoria, contrato } = await req.json()
  if (!nombre?.trim()) return NextResponse.json({ error: 'Nombre requerido' }, { status: 400 })

  let contratoPath: string | null = null
  let contratoNombre: string | null = null

  if (contrato?.base64 && contrato?.mimeType && contrato?.fileName) {
    const allowedMimes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp',
      'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
    if (!allowedMimes.includes(contrato.mimeType)) {
      return NextResponse.json({ error: 'Formato de contrato no permitido (PDF, Word o imagen)' }, { status: 400 })
    }
    try {
      const buffer   = Buffer.from(contrato.base64, 'base64')
      const safeName = contrato.fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
      contratoPath   = `PatrocinadorContratos/${Date.now()}-${safeName}`
      contratoNombre = contrato.fileName
      await uploadToSharePoint(contratoPath, buffer, contrato.mimeType)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al subir contrato'
      return NextResponse.json({ error: msg }, { status: 500 })
    }
  }

  const p = await prisma.patrocinador.create({
    data: {
      nombre: nombre.trim(),
      categoria: categoria || null,
      tenantId: tenantId ?? null,
      contratoPath,
      contratoNombre,
    },
  })
  return NextResponse.json(p, { status: 201 })
}

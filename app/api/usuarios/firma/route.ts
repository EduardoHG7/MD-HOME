export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// Firma del usuario actual (imagen data URL) para estampar en contratos
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { firmaImagen: true },
  })
  return NextResponse.json({ firmaImagen: user?.firmaImagen ?? null })
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Solo administradores pueden registrar su firma' }, { status: 403 })
  }

  const { firmaImagen } = await req.json()
  if (!firmaImagen || typeof firmaImagen !== 'string' || !firmaImagen.startsWith('data:image/')) {
    return NextResponse.json({ error: 'Firma inválida' }, { status: 400 })
  }
  // ~1MB máx: una firma dibujada en canvas pesa unos pocos KB
  if (firmaImagen.length > 1_000_000) {
    return NextResponse.json({ error: 'La imagen de la firma es demasiado grande' }, { status: 400 })
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { firmaImagen },
  })
  return NextResponse.json({ ok: true })
}

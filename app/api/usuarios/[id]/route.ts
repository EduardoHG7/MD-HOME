export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  // No permitir que el admin se quite su propio rol
  if (params.id === session.user.id) {
    return NextResponse.json({ error: 'No puedes cambiar tu propio rol' }, { status: 400 })
  }

  const { role, puedeVerFinanzas } = await req.json()
  const data: { role?: string; puedeVerFinanzas?: boolean } = {}

  if (role !== undefined) {
    if (!['ADMIN', 'USER', 'CONTABILIDAD'].includes(role)) {
      return NextResponse.json({ error: 'Rol inválido' }, { status: 400 })
    }
    data.role = role
  }

  if (puedeVerFinanzas !== undefined) {
    if (typeof puedeVerFinanzas !== 'boolean') {
      return NextResponse.json({ error: 'puedeVerFinanzas inválido' }, { status: 400 })
    }
    data.puedeVerFinanzas = puedeVerFinanzas
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 })
  }

  const user = await prisma.user.update({
    where: { id: params.id },
    data,
    select: { id: true, name: true, email: true, role: true, puedeVerFinanzas: true, createdAt: true },
  })

  return NextResponse.json(user)
}

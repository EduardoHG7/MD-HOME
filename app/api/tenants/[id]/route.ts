import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.isSuperAdmin) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json()
  const tenant = await prisma.tenant.update({
    where: { id: params.id },
    data: {
      ...(body.nombre !== undefined && { nombre: body.nombre }),
      ...(body.logo   !== undefined && { logo:   body.logo }),
      ...(body.activo !== undefined && { activo: body.activo }),
    },
  })
  return NextResponse.json(tenant)
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.isSuperAdmin) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  await prisma.tenant.delete({ where: { id: params.id } })
  return NextResponse.json({ ok: true })
}

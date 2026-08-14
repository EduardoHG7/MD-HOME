export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { hash } from 'bcryptjs'

// El admin le da una contraseña temporal a un aplicante que la olvidó. Al
// iniciar sesión con ella queda obligado a elegir una nueva antes de usar el
// resto del portal (debeCambiarPassword).
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { password } = await req.json()
  const passwordTrimmed = typeof password === 'string' ? password.trim() : ''
  if (passwordTrimmed.length < 6) {
    return NextResponse.json({ error: 'La contraseña debe tener al menos 6 caracteres' }, { status: 400 })
  }

  const passwordHash = await hash(passwordTrimmed, 12)
  await prisma.aplicante.update({
    where: { id: params.id },
    data: { passwordHash, debeCambiarPassword: true },
  })

  return NextResponse.json({ ok: true })
}

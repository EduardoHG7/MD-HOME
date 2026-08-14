export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { hash } from 'bcryptjs'

// El propio aplicante elige su nueva contraseña (tras un restablecimiento
// por admin, o cuando quiera cambiarla por su cuenta).
export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'APLICANTE') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { password } = await req.json()
  const passwordTrimmed = typeof password === 'string' ? password.trim() : ''
  if (passwordTrimmed.length < 6) {
    return NextResponse.json({ error: 'La contraseña debe tener al menos 6 caracteres' }, { status: 400 })
  }

  const passwordHash = await hash(passwordTrimmed, 12)
  await prisma.aplicante.update({
    where: { id: session.user.id },
    data: { passwordHash, debeCambiarPassword: false },
  })

  return NextResponse.json({ ok: true })
}

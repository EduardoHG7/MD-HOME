export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { hash } from 'bcryptjs'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const aplicantes = await prisma.aplicante.findMany({
    include: {
      asignaciones: {
        include: {
          evento: true,
          registros: { orderBy: { timestamp: 'asc' } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(aplicantes)
}

export async function POST(req: Request) {
  const {
    nombreCompleto, cedula, telefono, email, cuentaBancaria,
    password, fotoPersonal, fotoCedula, fotoConCedula,
  } = await req.json()

  if (!password || password.length < 6) {
    return NextResponse.json({ error: 'La contraseña debe tener al menos 6 caracteres' }, { status: 400 })
  }

  // Validar unicidad
  const existing = await prisma.aplicante.findFirst({
    where: { OR: [{ cedula }, { email }] },
  })
  if (existing) {
    const field = existing.cedula === cedula ? 'cédula' : 'correo'
    return NextResponse.json({ error: `Ya existe un aplicante con esa ${field}` }, { status: 409 })
  }

  const passwordHash = await hash(password, 12)

  const aplicante = await prisma.aplicante.create({
    data: {
      nombreCompleto,
      cedula,
      telefono,
      email,
      cuentaBancaria,
      passwordHash,
      fotoPersonal:    fotoPersonal    || null,
      fotoCedula:      fotoCedula      || null,
      fotoConCedula:   fotoConCedula   || null,
      terminosAceptados:    true,
      terminosAceptadosAt:  new Date(),
    },
  })
  return NextResponse.json(aplicante, { status: 201 })
}

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

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
  const { nombreCompleto, cedula, telefono, email, cuentaBancaria } = await req.json()

  // Validate cedula/email uniqueness
  const existing = await prisma.aplicante.findFirst({
    where: { OR: [{ cedula }, { email }] },
  })
  if (existing) {
    const field = existing.cedula === cedula ? 'cédula' : 'correo'
    return NextResponse.json({ error: `Ya existe un aplicante con esa ${field}` }, { status: 409 })
  }

  const aplicante = await prisma.aplicante.create({
    data: {
      nombreCompleto,
      cedula,
      telefono,
      email,
      cuentaBancaria,
      terminosAceptados: true,
      terminosAceptadosAt: new Date(),
    },
  })
  return NextResponse.json(aplicante, { status: 201 })
}

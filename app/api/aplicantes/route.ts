export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { hash } from 'bcryptjs'
import { getActiveTenantId } from '@/lib/tenant'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const tenantId = getActiveTenantId()

  const aplicantes = await prisma.aplicante.findMany({
    where: tenantId ? { OR: [{ tenantId }, { asignaciones: { some: { evento: { tenantId } } } }] } : {},
    include: {
      asignaciones: {
        where: tenantId ? { evento: { tenantId } } : {},
        include: {
          evento:    true,
          solicitud: { include: { tarifa: true } },
          registros: { orderBy: { timestamp: 'asc' } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(aplicantes)
}

export async function POST(req: Request) {
  const { nombreCompleto, cedula, telefono, email, cuentaBancaria, banco, tipoCuenta, password, fotoPersonal, fotoCedula, fotoConCedula, tenantId } = await req.json()

  if (!password || password.length < 6) {
    return NextResponse.json({ error: 'La contrasena debe tener al menos 6 caracteres' }, { status: 400 })
  }

  const existing = await prisma.aplicante.findFirst({ where: { OR: [{ cedula }, { email }] } })
  if (existing) {
    return NextResponse.json({ error: `Ya existe un aplicante con esa ${existing.cedula === cedula ? 'cedula' : 'correo'}` }, { status: 409 })
  }

  const passwordHash = await hash(password, 12)
  const aplicante = await prisma.aplicante.create({
    data: {
      nombreCompleto, cedula, telefono, email, cuentaBancaria,
      banco: banco || null, tipoCuenta: tipoCuenta || null, passwordHash,
      fotoPersonal: fotoPersonal || null, fotoCedula: fotoCedula || null, fotoConCedula: fotoConCedula || null,
      tenantId: tenantId || null,
      terminosAceptados: true, terminosAceptadosAt: new Date(),
    },
  })
  return NextResponse.json(aplicante, { status: 201 })
}

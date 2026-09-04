export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { hash } from 'bcryptjs'
import { getActiveTenantId } from '@/lib/tenant'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const tenantId = getActiveTenantId()

  // Los usuarios no-admin solo pueden ver la lista si su empresa activa es
  // Print Media PTY (necesitan revisar el personal disponible para eventos).
  if (session.user.role !== 'ADMIN') {
    const tenant = tenantId ? await prisma.tenant.findUnique({ where: { id: tenantId } }) : null
    if (tenant?.slug !== 'printmediapty') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }
  }

  const aplicantes = await prisma.aplicante.findMany({
    where: tenantId ? { OR: [{ tenantId }, { asignaciones: { some: { evento: { tenants: { some: { tenantId } } } } } }] } : {},
    include: {
      asignaciones: {
        where: tenantId ? { evento: { tenants: { some: { tenantId } } } } : {},
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
  const body = await req.json()
  const { banco, tipoCuenta, password, fotoPersonal, fotoCedula, fotoConCedula, tenantId } = body

  // Recortar espacios accidentales (muy común al escribir desde el teléfono)
  // — una cédula con un espacio de más nunca volvería a calzar en el login,
  // que sí busca por el valor recortado.
  const nombreCompleto = typeof body.nombreCompleto === 'string' ? body.nombreCompleto.trim() : body.nombreCompleto
  const cedula         = typeof body.cedula === 'string' ? body.cedula.trim() : body.cedula
  const telefono       = typeof body.telefono === 'string' ? body.telefono.trim() : body.telefono
  const email          = typeof body.email === 'string' ? body.email.trim() : body.email
  const cuentaBancaria = typeof body.cuentaBancaria === 'string' ? body.cuentaBancaria.trim() : body.cuentaBancaria

  const passwordTrimmed = typeof password === 'string' ? password.trim() : ''
  if (passwordTrimmed.length < 6) {
    return NextResponse.json({ error: 'La contrasena debe tener al menos 6 caracteres' }, { status: 400 })
  }

  const existing = await prisma.aplicante.findFirst({ where: { OR: [{ cedula }, { email }] } })
  if (existing) {
    return NextResponse.json({ error: `Ya existe un aplicante con esa ${existing.cedula === cedula ? 'cedula' : 'correo'}` }, { status: 409 })
  }

  const passwordHash = await hash(passwordTrimmed, 12)
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

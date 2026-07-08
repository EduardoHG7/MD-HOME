export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// Planilla del evento: se genera a partir de los eventuales asignados
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role === 'APLICANTE') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const evento = await prisma.evento.findUnique({
    where: { id: params.id },
    select: { id: true, nombre: true, fechaInicio: true, fechaFin: true, venue: { select: { nombre: true } } },
  })
  if (!evento) return NextResponse.json({ error: 'Evento no encontrado' }, { status: 404 })

  const asignaciones = await prisma.asignacionAplicante.findMany({
    where: { eventoId: params.id, estado: { not: 'CANCELADA' } },
    include: {
      aplicante: {
        select: { nombreCompleto: true, cedula: true, telefono: true, banco: true, tipoCuenta: true, cuentaBancaria: true },
      },
      solicitud: {
        select: {
          funcion: true,
          fechaInicioLabor: true,
          fechaFinLabor: true,
          tarifa: { select: { tipo: true, precioPorDia: true } },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  })

  const filas = asignaciones.map(a => {
    const inicio = a.solicitud.fechaInicioLabor
    const fin    = a.solicitud.fechaFinLabor
    const dias   = inicio && fin
      ? Math.max(1, Math.round((fin.getTime() - inicio.getTime()) / 86_400_000) + 1)
      : null
    const precio = a.solicitud.tarifa?.precioPorDia ?? null
    return {
      id:             a.id,
      nombreCompleto: a.aplicante.nombreCompleto,
      cedula:         a.aplicante.cedula,
      telefono:       a.aplicante.telefono,
      banco:          a.aplicante.banco,
      tipoCuenta:     a.aplicante.tipoCuenta,
      cuentaBancaria: a.aplicante.cuentaBancaria,
      funcion:        a.funcion,
      tarifaTipo:     a.solicitud.tarifa?.tipo ?? null,
      precioPorDia:   precio,
      dias,
      monto:          dias !== null && precio !== null ? dias * precio : null,
    }
  })

  return NextResponse.json({ evento, filas })
}

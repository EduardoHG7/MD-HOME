export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(_req: Request, { params }: { params: { eventoId: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const presupuesto = await prisma.presupuesto.findUnique({
    where: { eventoId: params.eventoId },
    include: {
      categorias: { include: { lineas: { orderBy: { orden: 'asc' } } }, orderBy: { orden: 'asc' } },
      ticketZonas:  { orderBy: { orden: 'asc' } },
      patrocinios:  true,
    },
  })

  return NextResponse.json(presupuesto)
}

export async function PUT(req: Request, { params }: { params: { eventoId: string } }) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const body = await req.json()
  const { artista, pais, ciudad, promotor, moneda, exchangeRate, numShows, artistGuarantee, categorias, ticketZonas, patrocinios } = body

  // Upsert presupuesto
  const presupuesto = await prisma.presupuesto.upsert({
    where: { eventoId: params.eventoId },
    create: { eventoId: params.eventoId, artista, pais, ciudad, promotor, moneda, exchangeRate, numShows, artistGuarantee },
    update: { artista, pais, ciudad, promotor, moneda, exchangeRate, numShows, artistGuarantee },
  })

  // Reemplazar categorías y líneas
  if (categorias !== undefined) {
    await prisma.presupuestoCategoria.deleteMany({ where: { presupuestoId: presupuesto.id } })
    for (let i = 0; i < categorias.length; i++) {
      const cat = categorias[i]
      const created = await prisma.presupuestoCategoria.create({
        data: { presupuestoId: presupuesto.id, nombre: cat.nombre, orden: i },
      })
      if (cat.lineas?.length) {
        await prisma.presupuestoLinea.createMany({
          data: cat.lineas.map((l: { descripcion: string; nota?: string; montoLocal: number; montoUsd: number; confianza?: string }, j: number) => ({
            categoriaId: created.id,
            descripcion: l.descripcion,
            nota:        l.nota        ?? null,
            montoLocal:  l.montoLocal  ?? 0,
            montoUsd:    l.montoUsd    ?? 0,
            confianza:   l.confianza   ?? null,
            orden: j,
          })),
        })
      }
    }
  }

  // Reemplazar ticket zonas
  if (ticketZonas !== undefined) {
    await prisma.ticketZona.deleteMany({ where: { presupuestoId: presupuesto.id } })
    if (ticketZonas.length) {
      await prisma.ticketZona.createMany({
        data: ticketZonas.map((z: { scaling?: string; zona: string; capacity: number; killsBlocks: number; comps: number; ticketPriceLocal: number; ticketPriceUsd: number }, i: number) => ({
          presupuestoId:   presupuesto.id,
          scaling:         z.scaling        ?? null,
          zona:            z.zona,
          capacity:        z.capacity        ?? 0,
          killsBlocks:     z.killsBlocks     ?? 0,
          comps:           z.comps           ?? 0,
          ticketPriceLocal: z.ticketPriceLocal ?? 0,
          ticketPriceUsd:   z.ticketPriceUsd   ?? 0,
          orden: i,
        })),
      })
    }
  }

  // Reemplazar patrocinios
  if (patrocinios !== undefined) {
    await prisma.patrocinio.deleteMany({ where: { presupuestoId: presupuesto.id } })
    if (patrocinios.length) {
      await prisma.patrocinio.createMany({
        data: patrocinios.map((p: { patrocinadorId?: string; nombre: string; tipo?: string; tipoPago?: string; montoLocal: number; montoUsd: number; notas?: string }) => ({
          presupuestoId:  presupuesto.id,
          patrocinadorId: p.patrocinadorId || null,
          nombre:         p.nombre,
          tipo:           p.tipo     || null,
          tipoPago:       p.tipoPago || null,
          montoLocal:     p.montoLocal ?? 0,
          montoUsd:       p.montoUsd   ?? 0,
          notas:          p.notas ?? null,
        })),
      })
    }
  }

  const result = await prisma.presupuesto.findUnique({
    where: { id: presupuesto.id },
    include: {
      categorias:  { include: { lineas: { orderBy: { orden: 'asc' } } }, orderBy: { orden: 'asc' } },
      ticketZonas: { orderBy: { orden: 'asc' } },
      patrocinios: true,
    },
  })

  return NextResponse.json(result)
}

import { Prisma } from '@prisma/client'

// Include compartido por todos los endpoints que devuelven una CotizacionPM
// al front (lista, aprobar, subir costo real, aprobar costo real, subir
// factura) — para que siempre viaje completa (items, facturas, etc.) y
// HistorialCotizacionesPM nunca reciba un objeto a medias al reemplazar su
// estado local.
export const cotizacionPMInclude = {
  items: { orderBy: { orden: 'asc' } },
  evento: { select: { id: true, nombre: true } },
  creadoPor: { select: { id: true, name: true, email: true, telefono: true } },
  aprobadaPor: { select: { name: true, email: true } },
  costoRealAprobadoPor: { select: { name: true, email: true } },
  facturaSubidaPor: { select: { name: true, email: true } },
  facturasCostoReal: true,
} satisfies Prisma.CotizacionPMInclude

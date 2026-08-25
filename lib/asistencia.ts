import { prisma } from '@/lib/prisma'
import { inicioJornada } from '@/lib/jornada'

// Determina si el próximo registro de la jornada actual (6am–6am) es
// ENTRADA o SALIDA, o null si ya completó el turno de hoy.
export async function proximoTipoRegistro(asignacionId: string): Promise<'ENTRADA' | 'SALIDA' | null> {
  const registrosHoy = await prisma.registroAsistencia.findMany({
    where: { asignacionId, timestamp: { gte: inicioJornada() } },
  })
  const tieneEntrada = registrosHoy.some(r => r.tipo === 'ENTRADA')
  const tieneSalida  = registrosHoy.some(r => r.tipo === 'SALIDA')

  if (!tieneEntrada) return 'ENTRADA'
  if (!tieneSalida) return 'SALIDA'
  return null
}

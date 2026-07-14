import { prisma } from '@/lib/prisma'
import { claveJornada } from '@/lib/jornada'

// Consolidado de eventuales asignados a un evento: quién los solicitó,
// días asignados vs escaneados, horas de entrada/salida y monto a pagar.
// Los días se agrupan por jornada de 6am a 6am (ver lib/jornada).

const TZ = 'America/Panama'

// Hora local HH:MM (24h) en Panamá
const horaLocal = (ts: Date) =>
  new Intl.DateTimeFormat('es-PA', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(ts)
// dd/mm a partir de una clave YYYY-MM-DD
const ddmm = (clave: string) => { const [, m, d] = clave.split('-'); return `${d}/${m}` }

export interface DiaAsistencia { fecha: string; entrada: string | null; salida: string | null }
export interface FilaAsignado {
  id: string
  nombre: string
  cedula: string
  funcion: string
  solicitante: string
  tarifaTipo: string | null
  precioPorDia: number | null
  diasAsignados: number | null
  diasEscaneados: number
  dias: DiaAsistencia[]
  montoAsignado: number | null
  montoEscaneado: number | null
}

export interface Consolidado {
  evento: { id: string; nombre: string }
  filas: FilaAsignado[]
  totales: {
    eventuales: number
    diasAsignados: number
    diasEscaneados: number
    montoAsignado: number
    montoEscaneado: number
  }
}

export async function getConsolidadoAsignados(
  eventoId: string,
  filtros?: { solicito?: string; funcion?: string },
): Promise<Consolidado | null> {
  const evento = await prisma.evento.findUnique({
    where: { id: eventoId },
    select: { id: true, nombre: true },
  })
  if (!evento) return null

  const asignaciones = await prisma.asignacionAplicante.findMany({
    where: { eventoId, estado: { not: 'CANCELADA' } },
    include: {
      aplicante: { select: { nombreCompleto: true, cedula: true } },
      solicitud: {
        select: {
          funcion: true,
          fechaInicioLabor: true,
          fechaFinLabor: true,
          solicitante: { select: { name: true, email: true } },
          tarifa: { select: { tipo: true, precioPorDia: true } },
        },
      },
      registros: { select: { tipo: true, timestamp: true }, orderBy: { timestamp: 'asc' } },
    },
    orderBy: { createdAt: 'asc' },
  })

  const filas: FilaAsignado[] = asignaciones.map(a => {
    const inicio = a.solicitud.fechaInicioLabor
    const fin    = a.solicitud.fechaFinLabor
    const diasAsignados = inicio && fin
      ? Math.max(1, Math.round((fin.getTime() - inicio.getTime()) / 86_400_000) + 1)
      : null
    const precio = a.solicitud.tarifa?.precioPorDia ?? null

    // Agrupar escaneos por día local
    const porDia = new Map<string, { entrada: Date | null; salida: Date | null }>()
    for (const r of a.registros) {
      const k = claveJornada(r.timestamp)
      if (!porDia.has(k)) porDia.set(k, { entrada: null, salida: null })
      const slot = porDia.get(k)!
      if (r.tipo === 'ENTRADA') { if (!slot.entrada || r.timestamp < slot.entrada) slot.entrada = r.timestamp }
      else if (r.tipo === 'SALIDA') { if (!slot.salida || r.timestamp > slot.salida) slot.salida = r.timestamp }
    }
    const dias: DiaAsistencia[] = Array.from(porDia.entries())
      .sort(([a1], [b1]) => a1.localeCompare(b1))
      .map(([k, v]) => ({ fecha: ddmm(k), entrada: v.entrada ? horaLocal(v.entrada) : null, salida: v.salida ? horaLocal(v.salida) : null }))
    // Días escaneados = días con al menos una ENTRADA
    const diasEscaneados = Array.from(porDia.values()).filter(v => v.entrada).length

    return {
      id:             a.id,
      nombre:         a.aplicante.nombreCompleto,
      cedula:         a.aplicante.cedula,
      funcion:        a.funcion,
      solicitante:    a.solicitud.solicitante?.name ?? a.solicitud.solicitante?.email ?? '—',
      tarifaTipo:     a.solicitud.tarifa?.tipo ?? null,
      precioPorDia:   precio,
      diasAsignados,
      diasEscaneados,
      dias,
      montoAsignado:  diasAsignados !== null && precio !== null ? diasAsignados * precio : null,
      montoEscaneado: precio !== null ? diasEscaneados * precio : null,
    }
  })

  // Filtros opcionales (por solicitante y/o función) — usados por el Excel
  const filasFiltradas = filas.filter(f =>
    (!filtros?.solicito || f.solicitante === filtros.solicito) &&
    (!filtros?.funcion  || f.funcion === filtros.funcion))

  const totales = filasFiltradas.reduce((t, f) => ({
    eventuales:     t.eventuales + 1,
    diasAsignados:  t.diasAsignados  + (f.diasAsignados ?? 0),
    diasEscaneados: t.diasEscaneados + f.diasEscaneados,
    montoAsignado:  t.montoAsignado  + (f.montoAsignado ?? 0),
    montoEscaneado: t.montoEscaneado + (f.montoEscaneado ?? 0),
  }), { eventuales: 0, diasAsignados: 0, diasEscaneados: 0, montoAsignado: 0, montoEscaneado: 0 })

  return { evento, filas: filasFiltradas, totales }
}

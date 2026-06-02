export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/prisma'
import { formatCurrency, formatDate } from '@/lib/utils'

function getMesCalendario(year: number, month: number) {
  const primerDia = new Date(year, month, 1).getDay() // 0=dom
  const diasEnMes = new Date(year, month + 1, 0).getDate()
  return { primerDia, diasEnMes }
}

export default async function AdminDashboard() {
  const [solicitudes, aplicantes, eventosData, eventosCount] = await Promise.all([
    prisma.solicitud.findMany({ include: { tarifa: true, evento: true } }),
    prisma.aplicante.count(),
    prisma.evento.findMany({
      where: { estado: { not: 'CANCELADO' } },
      orderBy: { fechaInicio: 'asc' },
      include: {
        _count: { select: { asignaciones: true } },
        solicitudes: { where: { estado: 'APROBADA' }, select: { numPersonas: true } },
      },
    }),
    prisma.evento.count({ where: { estado: 'ACTIVO' } }),
  ])

  const pendientes = solicitudes.filter(s => s.estado === 'PENDIENTE').length
  const aprobadas  = solicitudes.filter(s => s.estado === 'APROBADA').length

  const costoTotal = solicitudes
    .filter(s => s.estado === 'APROBADA')
    .reduce((acc, s) => {
      if (s.costoTotal != null) return acc + s.costoTotal
      if (s.tarifa && s.evento) {
        const ms   = new Date(s.evento.fechaFin).getTime() - new Date(s.evento.fechaInicio).getTime()
        const dias = Math.max(1, Math.ceil(ms / (1000 * 60 * 60 * 24)) + 1)
        return acc + s.tarifa.precioPorDia * s.numPersonas * dias
      }
      return acc
    }, 0)

  const stats = [
    { label: 'Solicitudes Pendientes', value: pendientes, icon: '⏳', border: 'border-l-yellow-400', text: 'text-yellow-600' },
    { label: 'Solicitudes Aprobadas',  value: aprobadas,  icon: '✓',  border: 'border-l-green-400',  text: 'text-green-600' },
    { label: 'Aplicantes Registrados', value: aplicantes, icon: '👥', border: 'border-l-gray-400',   text: 'text-gray-900' },
    { label: 'Eventos Activos',        value: eventosCount, icon: '🎪', border: 'border-l-amber-400', text: 'text-amber-600' },
  ]

  // Calendario del mes actual
  const hoy    = new Date()
  const year   = hoy.getFullYear()
  const month  = hoy.getMonth()
  const { primerDia, diasEnMes } = getMesCalendario(year, month)
  const MESES  = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
  const DIAS   = ['Do','Lu','Ma','Mi','Ju','Vi','Sá']

  // Marcar qué días tienen eventos
  const diasConEvento = new Set<number>()
  for (const ev of eventosData) {
    const inicio = new Date(ev.fechaInicio)
    const fin    = new Date(ev.fechaFin)
    for (let d = new Date(inicio); d <= fin; d.setDate(d.getDate() + 1)) {
      if (d.getFullYear() === year && d.getMonth() === month) {
        diasConEvento.add(d.getDate())
      }
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Panel de Administración</h1>
        <p className="text-gray-500 mt-1">Resumen general de Magic Dreams Productions</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4">
        {stats.map(s => (
          <div key={s.label} className={`card p-5 border-l-4 ${s.border}`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-500 text-sm">{s.label}</p>
                <p className={`text-3xl font-bold mt-1 ${s.text}`}>{s.value}</p>
              </div>
              <span className="text-3xl">{s.icon}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Cost summary */}
      <div className="card-gold p-6">
        <p className="text-gray-500 text-sm mb-1">Costo total aprobado acumulado</p>
        <p className="text-4xl font-bold text-amber-600">{formatCurrency(costoTotal)}</p>
        <p className="text-gray-400 text-xs mt-2">Suma de solicitudes aprobadas (estimado desde tarifa si no tiene costo fijo)</p>
      </div>

      {/* Personal por evento + Calendario */}
      <div className="grid grid-cols-2 gap-6 items-start">

        {/* Personal por evento */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Personal por evento</h2>
          {eventosData.length === 0 ? (
            <div className="card p-6 text-center text-gray-400 text-sm">No hay eventos registrados</div>
          ) : (
            eventosData.map(ev => {
              const asignados  = ev._count.asignaciones
              const solicitado = ev.solicitudes.reduce((a, s) => a + s.numPersonas, 0)
              const pct        = solicitado > 0 ? Math.min(100, Math.round((asignados / solicitado) * 100)) : 0
              const esHoy      = new Date(ev.fechaInicio) <= hoy && new Date(ev.fechaFin) >= hoy

              return (
                <div key={ev.id} className={`card p-4 ${esHoy ? 'border-l-4 border-l-green-400' : ''}`}>
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-gray-900 text-sm truncate">{ev.nombre}</p>
                        {esHoy && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full shrink-0">En curso</span>}
                      </div>
                      <p className="text-gray-400 text-xs mt-0.5">
                        {formatDate(ev.fechaInicio.toISOString())} – {formatDate(ev.fechaFin.toISOString())}
                      </p>
                    </div>
                    <div className="text-right shrink-0 ml-3">
                      <p className="text-2xl font-bold text-gray-900">{asignados}</p>
                      <p className="text-xs text-gray-400">/ {solicitado} solicitados</p>
                    </div>
                  </div>
                  {/* Barra de progreso */}
                  <div className="w-full bg-gray-100 rounded-full h-1.5">
                    <div
                      className={`h-1.5 rounded-full transition-all ${pct === 100 ? 'bg-green-400' : 'bg-amber-400'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-400 mt-1">{pct}% del personal asignado</p>
                </div>
              )
            })
          )}
        </div>

        {/* Calendario */}
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
            {MESES[month]} {year}
          </h2>

          {/* Cabecera días */}
          <div className="grid grid-cols-7 mb-1">
            {DIAS.map(d => (
              <div key={d} className="text-center text-xs text-gray-400 font-medium py-1">{d}</div>
            ))}
          </div>

          {/* Días */}
          <div className="grid grid-cols-7 gap-y-1">
            {/* celdas vacías antes del primer día */}
            {Array.from({ length: primerDia }).map((_, i) => (
              <div key={`e-${i}`} />
            ))}
            {Array.from({ length: diasEnMes }).map((_, i) => {
              const dia      = i + 1
              const esHoyDia = dia === hoy.getDate()
              const tieneEv  = diasConEvento.has(dia)
              return (
                <div key={dia} className="flex items-center justify-center aspect-square">
                  <div className={`w-8 h-8 flex items-center justify-center rounded-full text-sm font-medium transition-all
                    ${esHoyDia ? 'bg-gray-900 text-white' : tieneEv ? 'bg-amber-100 text-amber-700' : 'text-gray-600 hover:bg-gray-50'}
                  `}>
                    {dia}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Leyenda */}
          <div className="flex gap-4 mt-4 pt-4 border-t border-gray-100">
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <div className="w-3 h-3 rounded-full bg-gray-900" /> Hoy
            </div>
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <div className="w-3 h-3 rounded-full bg-amber-100 border border-amber-300" /> Con evento
            </div>
          </div>

          {/* Lista de eventos del mes */}
          {eventosData.filter(ev => {
            const ini = new Date(ev.fechaInicio)
            const fin = new Date(ev.fechaFin)
            return (ini.getFullYear() === year && ini.getMonth() === month) ||
                   (fin.getFullYear() === year && fin.getMonth() === month)
          }).length > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-100 space-y-2">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Este mes</p>
              {eventosData
                .filter(ev => {
                  const ini = new Date(ev.fechaInicio)
                  const fin = new Date(ev.fechaFin)
                  return (ini.getFullYear() === year && ini.getMonth() === month) ||
                         (fin.getFullYear() === year && fin.getMonth() === month)
                })
                .map(ev => (
                  <div key={ev.id} className="flex items-center gap-2 text-xs">
                    <div className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                    <span className="text-gray-700 font-medium truncate">{ev.nombre}</span>
                    <span className="text-gray-400 shrink-0 ml-auto">
                      {new Date(ev.fechaInicio).getDate()}/{new Date(ev.fechaInicio).getMonth() + 1}
                    </span>
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

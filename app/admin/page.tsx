export const dynamic = 'force-dynamic'

import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { formatCurrency, formatDate } from '@/lib/utils'
import PhoneEditor from '@/app/components/PhoneEditor'

function getMesCalendario(year: number, month: number) {
  const primerDia = new Date(year, month, 1).getDay() // 0=dom
  const diasEnMes = new Date(year, month + 1, 0).getDate()
  return { primerDia, diasEnMes }
}

export default async function AdminDashboard() {
  const session = await getServerSession(authOptions)

  const [solicitudes, aplicantes, eventosData, eventosCount, usuario] = await Promise.all([
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
    session ? prisma.user.findUnique({ where: { id: session.user.id }, select: { telefono: true } }) : null,
  ])

  const pendientes = solicitudes.filter(s => s.estado === 'PENDIENTE').length
  const aprobadas  = solicitudes.filter(s => s.estado === 'APROBADA').length

  const aprobadas_sol = solicitudes.filter(s => s.estado === 'APROBADA')

  const costoTotal = aprobadas_sol.reduce((acc, s) => {
    if (s.costoTotal != null) return acc + s.costoTotal
    if (s.tarifa && s.evento) {
      const ms   = new Date(s.evento.fechaFin).getTime() - new Date(s.evento.fechaInicio).getTime()
      const dias = Math.max(1, Math.ceil(ms / (1000 * 60 * 60 * 24)) + 1)
      return acc + s.tarifa.precioPorDia * s.numPersonas * dias
    }
    return acc
  }, 0)

  const presupuestoTotal = aprobadas_sol.reduce((acc, s) => acc + (s.presupuesto ?? 0), 0)
  const gananciaTotal    = presupuestoTotal - costoTotal
  const hayPresupuesto   = aprobadas_sol.some(s => s.presupuesto != null)

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

      {/* WhatsApp phone */}
      <PhoneEditor telefono={usuario?.telefono ?? null} />

      {/* Cost + ganancia */}
      <div className={`grid gap-4 ${hayPresupuesto ? 'grid-cols-3' : 'grid-cols-1'}`}>
        <div className="card-gold p-6">
          <p className="text-gray-500 text-sm mb-1">Costo total aprobado</p>
          <p className="text-4xl font-bold text-amber-600">{formatCurrency(costoTotal)}</p>
          <p className="text-gray-400 text-xs mt-2">Estimado desde tarifa si no tiene costo fijo</p>
        </div>
        {hayPresupuesto && (
          <>
            <div className="card p-6 border-l-4 border-l-blue-400">
              <p className="text-gray-500 text-sm mb-1">Presupuesto total clientes</p>
              <p className="text-4xl font-bold text-blue-600">{formatCurrency(presupuestoTotal)}</p>
              <p className="text-gray-400 text-xs mt-2">Suma de presupuestos de solicitudes aprobadas</p>
            </div>
            <div className={`card p-6 border-l-4 ${gananciaTotal >= 0 ? 'border-l-green-400' : 'border-l-red-400'}`}>
              <p className="text-gray-500 text-sm mb-1">{gananciaTotal >= 0 ? '✅ Ganancia estimada' : '❌ Pérdida estimada'}</p>
              <p className={`text-4xl font-bold ${gananciaTotal >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {gananciaTotal >= 0 ? '+' : ''}{formatCurrency(gananciaTotal)}
              </p>
              <p className="text-gray-400 text-xs mt-2">
                Presupuesto − Costo
                {presupuestoTotal > 0 && ` · ${Math.round((gananciaTotal / presupuestoTotal) * 100)}% margen`}
              </p>
            </div>
          </>
        )}
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
              const esHoy   = new Date(ev.fechaInicio) <= hoy && new Date(ev.fechaFin) >= hoy
              const personas = ev.solicitudes.reduce((a, s) => a + s.numPersonas, 0)

              // Costo total del evento: suma costoTotal explícito o estima desde tarifa
              const costoEvento = solicitudes
                .filter(s => s.estado === 'APROBADA' && s.eventoId === ev.id)
                .reduce((acc, s) => {
                  if (s.costoTotal != null) return acc + s.costoTotal
                  if (s.tarifa) {
                    const ms   = new Date(ev.fechaFin).getTime() - new Date(ev.fechaInicio).getTime()
                    const dias = Math.max(1, Math.ceil(ms / (1000 * 60 * 60 * 24)) + 1)
                    return acc + s.tarifa.precioPorDia * s.numPersonas * dias
                  }
                  return acc
                }, 0)

              return (
                <div key={ev.id} className={`card p-4 ${esHoy ? 'border-l-4 border-l-green-400' : ''}`}>
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-gray-900 text-sm truncate">{ev.nombre}</p>
                        {esHoy && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full shrink-0">En curso</span>}
                      </div>
                      <p className="text-gray-400 text-xs mt-0.5">
                        {formatDate(ev.fechaInicio.toISOString())} – {formatDate(ev.fechaFin.toISOString())}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 mt-3">
                    <div className="bg-gray-50 rounded-xl p-3">
                      <p className="text-gray-400 text-xs mb-0.5">Personal</p>
                      <p className="text-2xl font-bold text-gray-900">{personas}</p>
                      <p className="text-gray-400 text-xs">personas</p>
                    </div>
                    <div className="bg-amber-50 rounded-xl p-3">
                      <p className="text-gray-400 text-xs mb-0.5">Costo total</p>
                      <p className="text-xl font-bold text-amber-600">{formatCurrency(costoEvento)}</p>
                      <p className="text-gray-400 text-xs">{costoEvento === 0 ? 'sin costo asignado' : 'aprobado'}</p>
                    </div>
                  </div>
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

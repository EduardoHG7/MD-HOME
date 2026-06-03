export const dynamic = 'force-dynamic'

import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { formatCurrency, formatDate } from '@/lib/utils'

function getMesCalendario(year: number, month: number) {
  const primerDia = new Date(year, month, 1).getDay()
  const diasEnMes = new Date(year, month + 1, 0).getDate()
  return { primerDia, diasEnMes }
}

export default async function UsuarioDashboard() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const hoy = new Date()

  const [solicitudes, eventos] = await Promise.all([
    prisma.solicitud.findMany({
      where: { solicitanteId: session.user.id },
      include: {
        tarifa: true,
        evento: true,
        asignaciones: { where: { estado: 'ACTIVA' } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.evento.findMany({
      where: { estado: { not: 'CANCELADO' } },
      orderBy: { fechaInicio: 'asc' },
    }),
  ])

  const pendientes = solicitudes.filter(s => s.estado === 'PENDIENTE').length
  const aprobadas  = solicitudes.filter(s => s.estado === 'APROBADA').length
  const eventosActivos = eventos.filter(e => e.estado === 'ACTIVO').length

  // Mis solicitudes aprobadas con datos de asignación
  const misAprobadas = solicitudes.filter(s => s.estado === 'APROBADA')

  // Calendario
  const year  = hoy.getFullYear()
  const month = hoy.getMonth()
  const { primerDia, diasEnMes } = getMesCalendario(year, month)
  const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
  const DIAS  = ['Do','Lu','Ma','Mi','Ju','Vi','Sá']

  const diasConEvento = new Set<number>()
  for (const ev of eventos) {
    const ini = new Date(ev.fechaInicio)
    const fin = new Date(ev.fechaFin)
    for (let d = new Date(ini); d <= fin; d.setDate(d.getDate() + 1)) {
      if (d.getFullYear() === year && d.getMonth() === month) {
        diasConEvento.add(d.getDate())
      }
    }
  }

  const nombre = session.user?.name?.split(' ')[0] ?? 'usuario'

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Hola, {nombre} 👋</h1>
        <p className="text-gray-500 mt-1">Aquí está el resumen de tus solicitudes y eventos</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card p-5 border-l-4 border-l-yellow-400">
          <p className="text-gray-500 text-sm">Pendientes</p>
          <p className="text-3xl font-bold mt-1 text-yellow-600">{pendientes}</p>
        </div>
        <div className="card p-5 border-l-4 border-l-green-400">
          <p className="text-gray-500 text-sm">Aprobadas</p>
          <p className="text-3xl font-bold mt-1 text-green-600">{aprobadas}</p>
        </div>
        <div className="card p-5 border-l-4 border-l-amber-400">
          <p className="text-gray-500 text-sm">Eventos activos</p>
          <p className="text-3xl font-bold mt-1 text-amber-600">{eventosActivos}</p>
        </div>
      </div>

      {/* Personal por solicitud + Calendario */}
      <div className="grid grid-cols-2 gap-6 items-start">

        {/* Personal por solicitud aprobada */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Personal por evento</h2>
          {misAprobadas.length === 0 ? (
            <div className="card p-6 text-center text-gray-400 text-sm">
              <p className="text-2xl mb-2">📋</p>
              No tienes solicitudes aprobadas aún
            </div>
          ) : (
            misAprobadas.map(s => {
              const asignados  = s.asignaciones.length
              const pendienteN = s.numPersonas - asignados
              const esHoy      = new Date(s.evento.fechaInicio) <= hoy && new Date(s.evento.fechaFin) >= hoy

              const costo = s.costoTotal ?? (() => {
                if (!s.tarifa) return null
                const ms   = new Date(s.evento.fechaFin).getTime() - new Date(s.evento.fechaInicio).getTime()
                const dias = Math.max(1, Math.ceil(ms / (1000 * 60 * 60 * 24)) + 1)
                return s.tarifa.precioPorDia * s.numPersonas * dias
              })()

              return (
                <div key={s.id} className={`card p-4 ${esHoy ? 'border-l-4 border-l-green-400' : ''}`}>
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="font-semibold text-gray-900 text-sm truncate">{s.evento.nombre}</p>
                        {esHoy && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full shrink-0">En curso</span>}
                      </div>
                      <p className="text-gray-400 text-xs">{formatDate(s.evento.fechaInicio)} – {formatDate(s.evento.fechaFin)}</p>
                      <p className="text-gray-400 text-xs mt-0.5">{s.funcion}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="bg-green-50 rounded-xl p-3 text-center">
                      <p className="text-2xl font-bold text-green-700">{asignados}</p>
                      <p className="text-xs text-green-600 mt-0.5">Asignados</p>
                    </div>
                    <div className={`rounded-xl p-3 text-center ${pendienteN > 0 ? 'bg-yellow-50' : 'bg-gray-50'}`}>
                      <p className={`text-2xl font-bold ${pendienteN > 0 ? 'text-yellow-600' : 'text-gray-400'}`}>{pendienteN}</p>
                      <p className={`text-xs mt-0.5 ${pendienteN > 0 ? 'text-yellow-500' : 'text-gray-400'}`}>Por asignar</p>
                    </div>
                    <div className="bg-amber-50 rounded-xl p-3 text-center">
                      <p className="text-lg font-bold text-amber-600">{costo != null ? formatCurrency(costo) : '—'}</p>
                      <p className="text-xs text-amber-500 mt-0.5">Costo</p>
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

          <div className="grid grid-cols-7 mb-1">
            {DIAS.map(d => (
              <div key={d} className="text-center text-xs text-gray-400 font-medium py-1">{d}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-y-1">
            {Array.from({ length: primerDia }).map((_, i) => (
              <div key={`e-${i}`} />
            ))}
            {Array.from({ length: diasEnMes }).map((_, i) => {
              const dia      = i + 1
              const esHoyDia = dia === hoy.getDate()
              const tieneEv  = diasConEvento.has(dia)
              return (
                <div key={dia} className="flex items-center justify-center aspect-square">
                  <div className={`w-8 h-8 flex items-center justify-center rounded-full text-sm font-medium
                    ${esHoyDia ? 'bg-gray-900 text-white' : tieneEv ? 'bg-amber-100 text-amber-700' : 'text-gray-600 hover:bg-gray-50'}
                  `}>
                    {dia}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="flex gap-4 mt-4 pt-4 border-t border-gray-100">
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <div className="w-3 h-3 rounded-full bg-gray-900" /> Hoy
            </div>
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <div className="w-3 h-3 rounded-full bg-amber-100 border border-amber-300" /> Con evento
            </div>
          </div>

          {/* Eventos próximos del mes */}
          {eventos.filter(ev => {
            const ini = new Date(ev.fechaInicio)
            const fin = new Date(ev.fechaFin)
            return (ini.getFullYear() === year && ini.getMonth() === month) ||
                   (fin.getFullYear() === year && fin.getMonth() === month)
          }).length > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-100 space-y-2">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Este mes</p>
              {eventos
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

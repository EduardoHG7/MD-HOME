export const dynamic = 'force-dynamic'

import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { formatCurrency, formatDate } from '@/lib/utils'
import { getActiveTenantId } from '@/lib/tenant'
import PhoneEditor from '@/app/components/PhoneEditor'
import { CalendarioEventos } from '@/components/CalendarioEventos'

export default async function AdminDashboard() {
  const session = await getServerSession(authOptions)
  const tenantId = getActiveTenantId()

  const tenantFilter = tenantId ? { tenantId } : {}

  const [solicitudes, aplicantes, eventosData, eventosCount, usuario, activeTenant] = await Promise.all([
    prisma.solicitud.findMany({
      where: tenantId ? { evento: { tenantId } } : {},
      include: { tarifa: true, evento: true },
    }),
    prisma.aplicante.count(
      tenantId ? { where: { asignaciones: { some: { evento: { tenantId } } } } } : undefined
    ),
    prisma.evento.findMany({
      where: { estado: { not: 'CANCELADO' }, ...tenantFilter },
      orderBy: { fechaInicio: 'asc' },
      include: {
        _count: { select: { asignaciones: true } },
        solicitudes: { where: { estado: 'APROBADA' }, select: { numPersonas: true } },
      },
    }),
    prisma.evento.count({ where: { estado: 'ACTIVO', ...tenantFilter } }),
    session ? prisma.user.findUnique({ where: { id: session.user.id }, select: { telefono: true } }) : null,
    tenantId ? prisma.tenant.findUnique({ where: { id: tenantId }, select: { nombre: true } }) : null,
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

  const hoy = new Date()

  const eventosCalendario = eventosData.map(ev => ({
    id:            ev.id,
    nombre:        ev.nombre,
    fechaInicio:   ev.fechaInicio.toISOString(),
    fechaFin:      ev.fechaFin.toISOString(),
    montajeInicio: ev.montajeInicio?.toISOString() ?? null,
    desmontajeFin: ev.desmontajeFin?.toISOString() ?? null,
  }))

  const tenantNombre = activeTenant?.nombre ?? 'tu empresa'

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Panel de Administración</h1>
        <p className="text-gray-500 mt-1">Resumen general de {tenantNombre}</p>
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
      <div className={`grid gap-4 ${hayPresupuesto ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-1'}`}>
        <div className="card-gold p-6">
          <p className="text-gray-500 text-sm mb-1">Costo total aprobado</p>
          <p className="text-3xl font-bold text-amber-600 break-all">{formatCurrency(costoTotal)}</p>
          <p className="text-gray-400 text-xs mt-2">Estimado desde tarifa si no tiene costo fijo</p>
        </div>
        {hayPresupuesto && (
          <>
            <div className="card p-6 border-l-4 border-l-blue-400">
              <p className="text-gray-500 text-sm mb-1">Presupuesto total clientes</p>
              <p className="text-3xl font-bold text-blue-600 break-all">{formatCurrency(presupuestoTotal)}</p>
              <p className="text-gray-400 text-xs mt-2">Suma de presupuestos de solicitudes aprobadas</p>
            </div>
            <div className={`card p-6 border-l-4 ${gananciaTotal >= 0 ? 'border-l-green-400' : 'border-l-red-400'}`}>
              <p className="text-gray-500 text-sm mb-1">{gananciaTotal >= 0 ? '✅ Ganancia estimada' : '❌ Pérdida estimada'}</p>
              <p className={`text-3xl font-bold break-all ${gananciaTotal >= 0 ? 'text-green-600' : 'text-red-600'}`}>
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
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">

        {/* Personal por evento */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Personal por evento</h2>
          {eventosData.length === 0 ? (
            <div className="card p-6 text-center text-gray-400 text-sm">No hay eventos registrados</div>
          ) : (
            eventosData.map(ev => {
              const esHoy   = new Date(ev.fechaInicio) <= hoy && new Date(ev.fechaFin) >= hoy
              const personas = ev.solicitudes.reduce((a, s) => a + s.numPersonas, 0)

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
        <CalendarioEventos eventos={eventosCalendario} />
      </div>
    </div>
  )
}

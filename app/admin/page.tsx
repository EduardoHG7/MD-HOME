export const dynamic = 'force-dynamic'

import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getActiveTenantId } from '@/lib/tenant'
import PhoneEditor from '@/app/components/PhoneEditor'
import { CalendarioEventos } from '@/components/CalendarioEventos'

export default async function AdminDashboard() {
  const session = await getServerSession(authOptions)
  const tenantId = getActiveTenantId()

  const tenantFilter = tenantId ? { tenants: { some: { tenantId } } } : {}

  const [eventosData, usuario, activeTenant] = await Promise.all([
    prisma.evento.findMany({
      where: { estado: { not: 'CANCELADO' }, ...tenantFilter },
      orderBy: { fechaInicio: 'asc' },
      select: {
        id: true, nombre: true, estado: true,
        fechaInicio: true, fechaFin: true,
        montajeInicio: true, desmontajeFin: true,
      },
    }),
    session ? prisma.user.findUnique({ where: { id: session.user.id }, select: { telefono: true } }) : null,
    tenantId ? prisma.tenant.findUnique({ where: { id: tenantId }, select: { nombre: true, slug: true } }) : null,
  ])

  const entregasPM = activeTenant?.slug === 'printmediapty'
    ? await prisma.cotizacionPM.findMany({
        where: { tenantId, estado: 'APROBADA', fechaEntrega: { not: null } },
        orderBy: { fechaEntrega: 'asc' },
        select: { id: true, nombreTrabajo: true, clienteNombre: true, fechaEntrega: true },
        take: 8,
      })
    : []

  const eventosActivos      = eventosData.filter(e => e.estado === 'ACTIVO').length
  const eventosPorConfirmar = eventosData.filter(e => e.estado === 'POR_CONFIRMAR').length
  const eventosPorIniciar   = eventosData.filter(e => e.estado === 'POR_INICIAR').length

  // Promedio de eventos por mes: total de eventos entre meses distintos con eventos
  const mesesConEventos = new Set(
    eventosData.map(e => `${e.fechaInicio.getUTCFullYear()}-${e.fechaInicio.getUTCMonth()}`)
  )
  const promedioMes = mesesConEventos.size > 0
    ? Math.round((eventosData.length / mesesConEventos.size) * 10) / 10
    : 0

  const stats = [
    { label: 'Eventos Activos',         value: eventosActivos,      icon: '🎪', border: 'border-l-amber-400',  text: 'text-amber-600' },
    { label: 'Eventos Por Confirmar',   value: eventosPorConfirmar, icon: '❔', border: 'border-l-purple-400', text: 'text-purple-600' },
    { label: 'Eventos Por Iniciar',     value: eventosPorIniciar,   icon: '🚀', border: 'border-l-blue-400',   text: 'text-blue-600' },
    { label: 'Promedio Eventos / Mes',  value: promedioMes,         icon: '📊', border: 'border-l-teal-400',   text: 'text-teal-600' },
  ]

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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
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

      {/* Próximas entregas del cotizador (Print Media) */}
      {activeTenant?.slug === 'printmediapty' && (
        <div className="card p-5">
          <h2 className="font-semibold text-gray-900 mb-1">📦 Próximas entregas — Cotizador</h2>
          <p className="text-gray-400 text-sm mb-3">Fechas de entrega de trabajos aprobados y pendientes de completar.</p>
          {entregasPM.length === 0 ? (
            <p className="text-gray-400 text-sm">No hay entregas programadas.</p>
          ) : (
            <div className="space-y-1.5">
              {entregasPM.map(e => (
                <div key={e.id} className="flex items-center justify-between text-sm py-1.5 border-b border-gray-50 last:border-0">
                  <span className="text-gray-700">{e.nombreTrabajo} <span className="text-gray-400">· {e.clienteNombre}</span></span>
                  <span className="text-gray-500 font-medium">{e.fechaEntrega!.toLocaleDateString('es-PA', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Calendario */}
      <CalendarioEventos eventos={eventosCalendario} />
    </div>
  )
}

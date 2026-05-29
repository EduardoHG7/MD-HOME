import { prisma } from '@/lib/prisma'
import { formatCurrency } from '@/lib/utils'

export default async function AdminDashboard() {
  const [solicitudes, aplicantes, eventos] = await Promise.all([
    prisma.solicitud.findMany({ include: { tarifa: true } }),
    prisma.aplicante.count(),
    prisma.evento.count({ where: { estado: 'ACTIVO' } }),
  ])

  const pendientes = solicitudes.filter(s => s.estado === 'PENDIENTE').length
  const aprobadas  = solicitudes.filter(s => s.estado === 'APROBADA').length
  const costoTotal = solicitudes.filter(s => s.costoTotal).reduce((acc, s) => acc + (s.costoTotal ?? 0), 0)

  const stats = [
    { label: 'Solicitudes Pendientes', value: pendientes, icon: '⏳', border: 'border-l-yellow-400', text: 'text-yellow-600' },
    { label: 'Solicitudes Aprobadas',  value: aprobadas,  icon: '✓',  border: 'border-l-green-400',  text: 'text-green-600' },
    { label: 'Aplicantes Registrados', value: aplicantes, icon: '👥', border: 'border-l-gray-400',   text: 'text-gray-900' },
    { label: 'Eventos Activos',        value: eventos,    icon: '🎪', border: 'border-l-amber-400',  text: 'text-amber-600' },
  ]

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
        <p className="text-gray-400 text-xs mt-2">Suma de todas las solicitudes aprobadas con costo asignado</p>
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-2 gap-4">
        {[
          { href: '/admin/solicitudes', label: 'Gestionar Solicitudes', icon: '📋', desc: 'Aprobar o rechazar solicitudes de personal' },
          { href: '/admin/aplicantes',  label: 'Base de Aplicantes',   icon: '👥', desc: 'Ver todos los aplicantes y su historial' },
          { href: '/admin/eventos',     label: 'Gestionar Eventos',    icon: '🎪', desc: 'Crear y administrar eventos' },
          { href: '/admin/tarifas',     label: 'Configurar Tarifas',   icon: '💰', desc: 'Actualizar las tarifas de pago por día' },
        ].map(link => (
          <a key={link.href} href={link.href} className="card p-5 hover:border-gray-400 hover:shadow-md transition-all group">
            <span className="text-2xl">{link.icon}</span>
            <p className="text-gray-900 font-semibold mt-2 group-hover:text-black">{link.label}</p>
            <p className="text-gray-400 text-xs mt-1">{link.desc}</p>
          </a>
        ))}
      </div>
    </div>
  )
}

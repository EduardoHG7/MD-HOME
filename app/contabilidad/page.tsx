export const dynamic = 'force-dynamic'

import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { formatCurrency } from '@/lib/utils'

export default async function ContabilidadPage() {
  const session = await getServerSession(authOptions)
  if (!session) return null

  const [solicitudes, cotizaciones] = await Promise.all([
    prisma.solicitud.findMany({
      where: { estado: 'APROBADA' },
      include: { evento: true, solicitante: { select: { name: true, email: true } }, tarifa: true },
    }),
    prisma.cotizacion.findMany({
      where: { estado: 'APROBADA' },
      include: {
        creadoPor: { select: { name: true, email: true } },
        linea: { include: { categoria: { include: { presupuesto: { include: { evento: { select: { nombre: true } } } } } } } },
      },
    }),
  ])

  const costoPersonal = solicitudes.reduce((acc, s) => acc + (s.costoTotal ?? 0), 0)
  const costoCotizaciones = cotizaciones.reduce((acc, c) => acc + c.montoTotal, 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Panel de Contabilidad</h1>
        <p className="text-gray-500 mt-1">Vista de aprobaciones y costos (solo lectura)</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card-gold p-6">
          <p className="text-gray-500 text-sm mb-1">Personal aprobado</p>
          <p className="text-3xl font-bold text-amber-600 break-all">{formatCurrency(costoPersonal)}</p>
          <p className="text-gray-400 text-xs mt-2">{solicitudes.length} solicitud(es) aprobada(s)</p>
        </div>
        <div className="card p-6 border-l-4 border-l-blue-400">
          <p className="text-gray-500 text-sm mb-1">Cotizaciones aprobadas</p>
          <p className="text-3xl font-bold text-blue-600 break-all">{formatCurrency(costoCotizaciones)}</p>
          <p className="text-gray-400 text-xs mt-2">{cotizaciones.length} cotización(es) aprobada(s)</p>
        </div>
        <div className="card p-6 border-l-4 border-l-gray-400">
          <p className="text-gray-500 text-sm mb-1">Total comprometido</p>
          <p className="text-3xl font-bold text-gray-800 break-all">{formatCurrency(costoPersonal + costoCotizaciones)}</p>
          <p className="text-gray-400 text-xs mt-2">Personal + cotizaciones</p>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-700">
        💡 Este panel es de solo lectura. Para aprobar o rechazar solicitudes, contacta a un administrador.
      </div>
    </div>
  )
}

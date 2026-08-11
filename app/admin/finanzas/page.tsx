export const dynamic = 'force-dynamic'

import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { getActiveTenantId } from '@/lib/tenant'
import { prisma } from '@/lib/prisma'
import { ReporteFrame } from './ReporteFrame'

export default async function FinanzasPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const tenantId = getActiveTenantId()
  const tenant = tenantId ? await prisma.tenant.findUnique({ where: { id: tenantId } }) : null

  if (tenant?.slug !== 'panatickets') {
    return (
      <div className="max-w-2xl">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Finanzas</h1>
        <p className="text-gray-500">Todavía no hay reportes financieros para esta empresa.</p>
      </div>
    )
  }

  // El reporte en sí (varios MB, incluye todo el historial) se carga aparte
  // vía /admin/finanzas/reporte — ver ReporteFrame y ese route handler.
  return <ReporteFrame src="/admin/finanzas/reporte" />
}

export const dynamic = 'force-dynamic'

import fs from 'fs'
import path from 'path'
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

  const html = fs.readFileSync(
    path.join(process.cwd(), 'data', 'finanzas', 'conciliacion-showare-bancos.html'),
    'utf8'
  )

  return <ReporteFrame html={html} />
}

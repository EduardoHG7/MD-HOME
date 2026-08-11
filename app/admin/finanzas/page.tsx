export const dynamic = 'force-dynamic'
export const maxDuration = 300

import fs from 'fs'
import path from 'path'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { getActiveTenantId } from '@/lib/tenant'
import { prisma } from '@/lib/prisma'
import { getFinanzasPanatickets } from '@/lib/panatickets-finanzas'
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

  let datos
  try {
    datos = await getFinanzasPanatickets()
  } catch (e) {
    return (
      <div className="max-w-2xl">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Finanzas</h1>
        <p className="text-red-600 font-medium">No se pudo cargar el reporte desde SharePoint.</p>
        <p className="text-gray-500 text-sm mt-2">{e instanceof Error ? e.message : String(e)}</p>
      </div>
    )
  }

  const template = fs.readFileSync(
    path.join(process.cwd(), 'data', 'finanzas', 'conciliacion-showare-bancos.html'),
    'utf8'
  )

  const generadoEn = new Intl.DateTimeFormat('es-PA', {
    day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
    timeZone: 'America/Panama',
  }).format(new Date(datos.generatedAt))

  // Los reemplazos van con función (no string) porque String.replace trata
  // secuencias como $&, $$, $` de forma especial en el string de reemplazo —
  // y estos son datos financieros, así que un solo "$" en cualquier monto,
  // cuenta o descripción corrompe el JSON incrustado y tumba el parseo en
  // el cliente (visto como "Application error" en blanco al abrir Finanzas).
  const html = template
    .replace('__DATA_JSON__', () => JSON.stringify(datos.DATA))
    .replace('__SALDOS_JSON__', () => JSON.stringify(datos.SALDOS))
    .replace('__CANCELADAS_JSON__', () => JSON.stringify(datos.CANCELADAS))
    .replace('__GLOBAL_SUMMARY_JSON__', () => JSON.stringify(datos.GLOBAL_SUMMARY))
    .replace('__EXEC_SUMMARY_JSON__', () => JSON.stringify(datos.EXEC_SUMMARY))
    .replaceAll('__FECHA_SALDOS__', () => datos.SALDOS.fecha_saldos)
    .replaceAll('__GENERADO_EN__', () => generadoEn)

  return <ReporteFrame html={html} />
}

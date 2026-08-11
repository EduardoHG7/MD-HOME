export const dynamic = 'force-dynamic'
export const maxDuration = 300

import fs from 'fs'
import path from 'path'
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getActiveTenantId } from '@/lib/tenant'
import { prisma } from '@/lib/prisma'
import { getFinanzasPanatickets } from '@/lib/panatickets-finanzas'

function paginaError(mensaje: string, detalle?: string) {
  return `<!doctype html><html><body style="font-family:sans-serif;padding:32px;color:#111">
    <h2 style="margin:0 0 8px">Finanzas</h2>
    <p style="color:#dc2626;font-weight:600;margin:0">${mensaje}</p>
    ${detalle ? `<p style="color:#6b7280;font-size:14px;margin-top:8px">${detalle}</p>` : ''}
  </body></html>`
}

// El reporte se sirve como respuesta HTTP normal (no como parte del render de
// la página) y el iframe lo carga con src, no srcDoc: el documento entero
// (varios MB, incluye TODO el historial de ventas sin recortar) pasaba antes
// por el pipeline de render/streaming de Next.js (RSC) y eso terminaba en
// "Connection closed" al crecer. Como respuesta HTTP plana no tiene ese límite.
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return new NextResponse(paginaError('No autorizado.'), { status: 401, headers: { 'Content-Type': 'text/html; charset=utf-8' } })

  const tenantId = getActiveTenantId()
  const tenant = tenantId ? await prisma.tenant.findUnique({ where: { id: tenantId } }) : null
  if (tenant?.slug !== 'panatickets') {
    return new NextResponse(paginaError('No autorizado.'), { status: 403, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
  }

  let datos
  try {
    datos = await getFinanzasPanatickets()
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return new NextResponse(paginaError('No se pudo cargar el reporte desde SharePoint.', msg), {
      status: 502,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
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
  // cuenta o descripción corrompe el JSON incrustado.
  const html = template
    .replace('__DATA_JSON__', () => JSON.stringify(datos.DATA))
    .replace('__SALDOS_JSON__', () => JSON.stringify(datos.SALDOS))
    .replace('__CANCELADAS_JSON__', () => JSON.stringify(datos.CANCELADAS))
    .replace('__GLOBAL_SUMMARY_JSON__', () => JSON.stringify(datos.GLOBAL_SUMMARY))
    .replace('__EXEC_SUMMARY_JSON__', () => JSON.stringify(datos.EXEC_SUMMARY))
    .replaceAll('__FECHA_SALDOS__', () => datos.SALDOS.fecha_saldos)
    .replaceAll('__GENERADO_EN__', () => generadoEn)

  return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}

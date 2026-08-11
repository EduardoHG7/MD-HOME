export const dynamic = 'force-dynamic'

import fs from 'fs'
import path from 'path'
import { gzipSync } from 'zlib'
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getActiveTenantId } from '@/lib/tenant'
import { prisma } from '@/lib/prisma'

function paginaError(mensaje: string) {
  return `<!doctype html><html><body style="font-family:sans-serif;padding:32px;color:#111">
    <h2 style="margin:0 0 8px">Finanzas</h2>
    <p style="color:#dc2626;font-weight:600;margin:0">${mensaje}</p>
  </body></html>`
}

// Ahora solo sirve la plantilla estática (HTML/CSS/JS, sin datos). Los datos
// los pide el propio script de la plantilla a /admin/finanzas/reporte/data
// por rango — así el tamaño de esta respuesta no depende de cuánto historial
// haya en Postgres, y el dashboard puede pedir años específicos para
// comparar sin tener que cargar todo de una vez.
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return new NextResponse(paginaError('No autorizado.'), { status: 401, headers: { 'Content-Type': 'text/html; charset=utf-8' } })

  const tenantId = getActiveTenantId()
  const tenant = tenantId ? await prisma.tenant.findUnique({ where: { id: tenantId } }) : null
  if (tenant?.slug !== 'panatickets') {
    return new NextResponse(paginaError('No autorizado.'), { status: 403, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
  }

  const html = fs.readFileSync(
    path.join(process.cwd(), 'data', 'finanzas', 'conciliacion-showare-bancos.html'),
    'utf8'
  )

  const gzipped = gzipSync(Buffer.from(html, 'utf8'))
  return new NextResponse(gzipped, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Encoding': 'gzip',
    },
  })
}

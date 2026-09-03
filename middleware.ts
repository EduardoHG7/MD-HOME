import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { esOperadorPanatickets } from './lib/permisos'

const PUBLIC_PATHS = [
  '/login',
  '/seleccionar-empresa',
  '/aplicante',
  '/api/auth',
  '/api/tenants/seleccionar',
  '/api/asistencia',
  '/api/upload/foto', // registro público de aplicantes: sube fotos antes de tener sesión
  '/api/empresas-publicas', // registro público: lista de empresas para elegir, sin datos sensibles
  '/registro', // registro público de clientes/proveedores (Print Media PTY): solo deja datos, no crea usuario
  '/api/registro', // POST público que recibe esos formularios de clientes/proveedores
  '/api/cron', // llamado por Vercel Cron (server-to-server) — se autoriza con CRON_SECRET, no con sesión
  '/_next',
  '/favicon',
  '/logo',
]

// Coincidencia EXACTA (no de prefijo): abre solo esa ruta puntual, nunca sus
// subrutas. /api/aplicantes (POST) es el registro público — su GET/PATCH por
// id (/api/aplicantes/{id}) sigue requiriendo sesión, ya que ese GET no
// valida el rol por su cuenta y expone datos personales del aplicante.
const PUBLIC_EXACT_PATHS = ['/api/aplicantes']

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Skip public paths
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p)) || PUBLIC_EXACT_PATHS.includes(pathname)) {
    return NextResponse.next()
  }

  // Skip static files
  if (pathname.includes('.')) return NextResponse.next()

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })

  // Not authenticated → login
  if (!token) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  // Aplicante routes don't need tenant
  if (token.role === 'APLICANTE') return NextResponse.next()

  // API routes: inject tenant from cookie into header for route handlers
  const activeTenantId = req.cookies.get('active_tenant_id')?.value

  if (pathname.startsWith('/api/')) {
    const res = NextResponse.next()
    if (activeTenantId) res.headers.set('x-tenant-id', activeTenantId)
    return res
  }

  // App routes: if no active tenant and user has tenants, redirect to selector
  const availableTenants = (token.availableTenants as { id: string; slug: string }[] | undefined) ?? []
  if (!activeTenantId && availableTenants.length > 0) {
    return NextResponse.redirect(new URL('/seleccionar-empresa', req.url))
  }

  // Operador Panatickets: personal eventual sin asignación explícita a
  // ninguna empresa, acotado por defecto a Panatickets. Dentro de /admin
  // solo puede ver el Dashboard (raíz), Eventos y Venues; cualquier otra
  // ruta admin lo manda al dashboard.
  const esPana = esOperadorPanatickets(availableTenants, token.role as string)
  const rutaOperadorOk = pathname === '/admin' ||
    pathname.startsWith('/admin/eventos') || pathname.startsWith('/admin/venues')
  if (esPana && pathname.startsWith('/admin') && !rutaOperadorOk) {
    return NextResponse.redirect(new URL('/admin', req.url))
  }
  // El operador maneja eventuales, no cotizaciones ni facturas
  if (esPana && (pathname.startsWith('/usuario/cotizaciones') || pathname.startsWith('/usuario/facturas'))) {
    return NextResponse.redirect(new URL('/usuario/solicitar', req.url))
  }

  // Usuario sin rol admin con acceso concedido solo a Finanzas: no puede
  // navegar al resto del panel admin (usuarios, eventos, facturas, etc.)
  const soloFinanzas = token.role !== 'ADMIN' && !esPana && Boolean(token.puedeVerFinanzas)
  const rutaFinanzasOk = pathname === '/admin' || pathname.startsWith('/admin/finanzas')
  if (soloFinanzas && pathname.startsWith('/admin') && !rutaFinanzasOk) {
    return NextResponse.redirect(new URL('/admin', req.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|public/).*)'],
}

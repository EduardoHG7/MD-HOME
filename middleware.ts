import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'

const PUBLIC_PATHS = [
  '/login',
  '/seleccionar-empresa',
  '/aplicante',
  '/api/auth',
  '/api/tenants/seleccionar',
  '/api/asistencia',
  '/_next',
  '/favicon',
  '/logo',
]

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Skip public paths
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
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
  const availableTenants = (token.availableTenants as { id: string }[] | undefined) ?? []
  if (!activeTenantId && availableTenants.length > 0) {
    return NextResponse.redirect(new URL('/seleccionar-empresa', req.url))
  }

  // Operador Panatickets (usuario @panatickets.com): dentro de /admin solo puede
  // ver la sección Eventos; cualquier otra ruta admin lo manda a /admin/eventos.
  const email = ((token.email as string | undefined) ?? '').toLowerCase()
  const esPana = token.role !== 'ADMIN' && email.endsWith('@panatickets.com')
  if (esPana && pathname.startsWith('/admin') && !pathname.startsWith('/admin/eventos')) {
    return NextResponse.redirect(new URL('/admin/eventos', req.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|public/).*)'],
}

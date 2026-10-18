import { NextRequest, NextResponse } from 'next/server'
import { SESSION_COOKIE, isValidSessionToken } from '@/lib/auth'

// Protege el panel de admin y sus APIs. El webhook de CodeREADr, el stream
// SSE y la pantalla del kiosko quedan fuera a propósito: son públicos por
// diseño (protegidos únicamente por el token largo y aleatorio de cada
// punto), porque CodeREADr y las pantallas de impresión no tienen forma de
// mandar la cookie de sesión del admin.
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const isProtectedPage = pathname.startsWith('/admin')
  const isProtectedApi =
    pathname.startsWith('/api/puntos') || pathname.startsWith('/api/mapping')

  if (!isProtectedPage && !isProtectedApi) return NextResponse.next()

  const token = req.cookies.get(SESSION_COOKIE)?.value
  const valid = await isValidSessionToken(token)

  if (valid) return NextResponse.next()

  if (isProtectedApi) {
    return new NextResponse('No autorizado', { status: 401 })
  }

  const loginUrl = new URL('/login', req.url)
  return NextResponse.redirect(loginUrl)
}

export const config = {
  matcher: ['/admin/:path*', '/api/puntos/:path*', '/api/mapping/:path*'],
}

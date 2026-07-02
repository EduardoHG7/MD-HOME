import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { tenantId } = await req.json()
  if (!tenantId) return NextResponse.json({ error: 'tenantId requerido' }, { status: 400 })

  const available = session.user.availableTenants ?? []
  if (!session.user.isSuperAdmin && !available.find(t => t.id === tenantId)) {
    return NextResponse.json({ error: 'Sin acceso a esta empresa' }, { status: 403 })
  }

  // Use NextResponse.cookies to actually set the cookie (cookies() from next/headers is read-only in Route Handlers)
  const res = NextResponse.json({ ok: true })
  res.cookies.set('active_tenant_id', tenantId, {
    httpOnly: false,
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
    sameSite: 'lax',
  })
  return res
}

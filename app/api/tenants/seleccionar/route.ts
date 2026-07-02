import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { cookies } from 'next/headers'

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { tenantId } = await req.json()
  if (!tenantId) return NextResponse.json({ error: 'tenantId requerido' }, { status: 400 })

  // Verify the user has access to this tenant (or is super-admin)
  const available = session.user.availableTenants ?? []
  if (!session.user.isSuperAdmin && !available.find(t => t.id === tenantId)) {
    return NextResponse.json({ error: 'Sin acceso a esta empresa' }, { status: 403 })
  }

  const cookieStore = cookies()
  cookieStore.set('active_tenant_id', tenantId, {
    httpOnly: true,
    path: '/',
    maxAge: 60 * 60 * 24 * 30, // 30 days
    sameSite: 'lax',
  })

  return NextResponse.json({ ok: true })
}

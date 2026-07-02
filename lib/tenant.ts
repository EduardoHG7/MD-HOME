import { cookies } from 'next/headers'
import { getServerSession } from 'next-auth'
import { authOptions } from './auth'

export async function getActiveTenantId(): Promise<string | null> {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return null

  // Super-admins and all users: read from cookie
  const cookieStore = cookies()
  const tenantId = cookieStore.get('active_tenant_id')?.value
  if (!tenantId) return null

  // Verify this user actually has access to this tenant
  if (session.user.isSuperAdmin) return tenantId

  const available = session.user.availableTenants ?? []
  const found = available.find(t => t.id === tenantId)
  return found ? tenantId : null
}

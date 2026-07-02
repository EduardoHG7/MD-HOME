import { cookies } from 'next/headers'

// Just read the cookie — API routes already validate the session themselves.
export function getActiveTenantId(): string | null {
  try {
    return cookies().get('active_tenant_id')?.value ?? null
  } catch {
    return null
  }
}

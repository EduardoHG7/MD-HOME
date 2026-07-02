'use client'

import { useSession } from 'next-auth/react'
import { useMemo } from 'react'
import type { TenantInfo } from '@/types/next-auth'

// Reads the active_tenant_id cookie client-side to find the active tenant
function getActiveTenantIdFromCookie(): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(/(?:^|;\s*)active_tenant_id=([^;]+)/)
  return match ? match[1] : null
}

export function useTenant() {
  const { data: session } = useSession()

  const activeTenant = useMemo<TenantInfo | null>(() => {
    const tenants = session?.user?.availableTenants ?? []
    if (tenants.length === 0) return null
    if (tenants.length === 1) return tenants[0]

    const cookieId = getActiveTenantIdFromCookie()
    return tenants.find(t => t.id === cookieId) ?? tenants[0]
  }, [session])

  return { activeTenant }
}

import 'next-auth'

export interface TenantInfo {
  id:     string
  slug:   string
  nombre: string
  logo:   string | null
  role:   string
}

declare module 'next-auth' {
  interface Session {
    user: {
      id:                string
      name?:             string | null
      email?:            string | null
      image?:            string | null
      role:              'ADMIN' | 'USER' | 'APLICANTE' | 'CONTABILIDAD'
      isSuperAdmin:      boolean
      availableTenants:  TenantInfo[]
    }
  }
}

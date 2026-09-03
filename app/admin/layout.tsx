export const dynamic = 'force-dynamic'

import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { AdminSidebar } from '@/components/AdminSidebar'
import { esOperadorPanatickets, puedeVerFinanzas } from '@/lib/permisos'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  // Operador Panatickets (usuario @panatickets.com): visual de admin acotada a Eventos
  const soloEventos = esOperadorPanatickets(session.user.availableTenants, session.user.role)
  // Usuario sin rol admin al que se le concedió ver Finanzas: entra acotado a esa sección
  // (el acotamiento real de qué rutas puede visitar vive en middleware.ts)
  if (session.user.role !== 'ADMIN' && !soloEventos && !puedeVerFinanzas(session.user)) {
    redirect('/usuario/solicitar')
  }

  return (
    <div className="min-h-screen flex">
      <AdminSidebar session={session} soloEventos={soloEventos} />
      <main className="flex-1 lg:ml-64 p-8 pt-20 lg:pt-8 max-w-7xl">{children}</main>
    </div>
  )
}

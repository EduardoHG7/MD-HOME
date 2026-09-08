export const dynamic = 'force-dynamic'

import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { AdminSidebar } from '@/components/AdminSidebar'
import { esOperadorPanatickets, puedeVerFinanzas } from '@/lib/permisos'
import { getActiveTenantId } from '@/lib/tenant'
import { puedeAprobar } from '@/lib/aprobaciones'

// A dónde mandar a un usuario sin permisos que intentó entrar a una ruta de
// /admin — para que un link de correo (ej: a /admin/cotizaciones-pm) lo deje
// en su equivalente real de /usuario, no siempre en Solicitudes.
function equivalenteUsuario(pathname: string): string {
  if (pathname.startsWith('/admin/cotizaciones-pm')) return '/usuario/cotizaciones-pm'
  if (pathname.includes('tab=cotizaciones')) return '/usuario/cotizaciones'
  return '/usuario/solicitar'
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  // Operador Panatickets (usuario @panatickets.com): visual de admin acotada a Eventos
  const soloEventos = esOperadorPanatickets(session.user.availableTenants, session.user.role)
  // Usuario sin rol admin designado como aprobador (Solicitudes, Caja Menuda,
  // Cotizaciones, Cotizador PM) en la empresa activa: entra acotado a esas
  // secciones.
  const tenantId = getActiveTenantId()
  const soloAprobador = session.user.role !== 'ADMIN' && !soloEventos &&
    Boolean(tenantId) && (await puedeAprobar([tenantId!], session.user))
  // Usuario sin rol admin al que se le concedió ver Finanzas: entra acotado a esa sección
  // (el acotamiento real de qué rutas puede visitar vive en middleware.ts)
  if (session.user.role !== 'ADMIN' && !soloEventos && !soloAprobador && !puedeVerFinanzas(session.user)) {
    redirect(equivalenteUsuario(headers().get('x-pathname') ?? ''))
  }

  return (
    <div className="min-h-screen flex">
      <AdminSidebar session={session} soloEventos={soloEventos} soloAprobador={soloAprobador} />
      <main className="flex-1 lg:ml-64 p-8 pt-20 lg:pt-8 max-w-7xl">{children}</main>
    </div>
  )
}

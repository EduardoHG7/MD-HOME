export const dynamic = 'force-dynamic'

import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { AdminSidebar } from '@/components/AdminSidebar'

export default async function ContabilidadLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')
  if (session.user.role !== 'CONTABILIDAD') redirect('/usuario/solicitar')

  return (
    <div className="min-h-screen flex">
      <AdminSidebar session={session} role="CONTABILIDAD" />
      <main className="flex-1 lg:ml-64 p-8 pt-20 lg:pt-8 max-w-7xl">{children}</main>
    </div>
  )
}

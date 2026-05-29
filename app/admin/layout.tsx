export const dynamic = 'force-dynamic'

import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { AdminSidebar } from '@/components/AdminSidebar'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')
  if (session.user.role !== 'ADMIN') redirect('/usuario/solicitar')

  return (
    <div className="min-h-screen flex">
      <AdminSidebar session={session} />
      <main className="flex-1 ml-64 p-8 max-w-7xl">{children}</main>
    </div>
  )
}

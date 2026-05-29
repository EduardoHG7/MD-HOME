export const dynamic = 'force-dynamic'

import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { UserNav } from '@/components/UserNav'

export default async function UsuarioLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  return (
    <div className="min-h-screen">
      <UserNav session={session} />
      <main className="max-w-4xl mx-auto px-4 py-8">{children}</main>
    </div>
  )
}

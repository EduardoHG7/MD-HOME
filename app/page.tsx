export const dynamic = 'force-dynamic'

import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { esOperadorPanatickets } from '@/lib/permisos'

export default async function Home() {
  const session = await getServerSession(authOptions)

  if (!session) redirect('/login')
  if (session.user.role === 'ADMIN') redirect('/admin')
  if (session.user.role === 'CONTABILIDAD') redirect('/contabilidad')
  // Operador Panatickets (usuario @panatickets.com): visual de admin en Eventos
  if (esOperadorPanatickets(session.user.email, session.user.role)) redirect('/admin')
  redirect('/usuario')
}

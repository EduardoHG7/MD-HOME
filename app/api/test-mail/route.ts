export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getAppToken } from '@/lib/sharepoint'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const fromEmail = session.user.email!

  // Ver qué admins hay en la BD
  const admins = await prisma.user.findMany({ where: { role: 'ADMIN' }, select: { email: true, name: true, role: true } })

  // Intentar enviar a todos los admins
  const token = await getAppToken()
  const adminEmails = admins.map(a => a.email)

  let mailStatus = null
  let mailError  = null

  if (adminEmails.length > 0) {
    const res = await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(fromEmail)}/sendMail`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: {
            subject: 'Test — solicitud de personal',
            body: { contentType: 'Text', content: `Correo de prueba enviado por ${fromEmail} a los admins.` },
            toRecipients: adminEmails.map(e => ({ emailAddress: { address: e } })),
          },
          saveToSentItems: false,
        }),
      }
    )
    mailStatus = res.status
    mailError  = res.ok ? null : await res.text()
  }

  return NextResponse.json({
    senderEmail: fromEmail,
    senderRole:  session.user.role,
    adminsEnBD:  admins,
    adminEmails,
    mailStatus,
    mailError,
  })
}

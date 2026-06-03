export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getAppToken } from '@/lib/sharepoint'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const fromEmail = session.user.email!
  const toEmail   = session.user.email!

  try {
    const token = await getAppToken()

    const res = await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(fromEmail)}/sendMail`,
      {
        method: 'POST',
        headers: {
          Authorization:  `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: {
            subject: 'Test desde usuario normal',
            body: { contentType: 'Text', content: 'Prueba de envío.' },
            toRecipients: [{ emailAddress: { address: toEmail } }],
          },
          saveToSentItems: false,
        }),
      }
    )

    const status   = res.status
    const respBody = await res.text()

    return NextResponse.json({ fromEmail, toEmail, status, respBody })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

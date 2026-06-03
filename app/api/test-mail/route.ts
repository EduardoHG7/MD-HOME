export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getAppToken } from '@/lib/sharepoint'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const fromEmail = session.user.email!
  const toEmail   = session.user.email!

  try {
    // 1. Obtener token y mostrar scopes
    const token = await getAppToken()
    const tokenPayload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString())

    // 2. Intentar enviar correo
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
            subject: 'Test Magic Dreams - Correo de prueba',
            body: { contentType: 'Text', content: 'Si recibes esto, el sistema de correos está funcionando correctamente.' },
            toRecipients: [{ emailAddress: { address: toEmail } }],
          },
          saveToSentItems: false,
        }),
      }
    )

    const status = res.status
    const body   = res.ok ? 'OK (202)' : await res.text()

    return NextResponse.json({
      fromEmail,
      toEmail,
      tokenScopes: tokenPayload.roles ?? tokenPayload.scp ?? 'N/A',
      tokenApp:    tokenPayload.appid ?? 'N/A',
      mailStatus:  status,
      mailResponse: body,
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

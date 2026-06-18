export async function sendWhatsApp(to: string, body: string): Promise<void> {
  const sid   = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  const from  = process.env.TWILIO_WHATSAPP_FROM

  if (!sid)    { console.error('[whatsapp] Falta TWILIO_ACCOUNT_SID'); return }
  if (!token)  { console.error('[whatsapp] Falta TWILIO_AUTH_TOKEN'); return }
  if (!from)   { console.error('[whatsapp] Falta TWILIO_WHATSAPP_FROM'); return }
  if (!to)     { console.error('[whatsapp] Número destino vacío'); return }

  const toWa = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`

  console.log(`[whatsapp] Enviando a ${toWa} desde ${from}`)

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ From: from, To: toWa, Body: body }).toString(),
    }
  )

  if (!res.ok) {
    const err = await res.text()
    console.error(`[whatsapp] Error (${res.status}):`, err)
    throw new Error(`Twilio error ${res.status}: ${err}`)
  } else {
    console.log(`[whatsapp] OK (${res.status}) para ${toWa}`)
  }
}

// Envío de correos via Microsoft Graph API (app-only, Mail.Send)
import { getAppToken } from './sharepoint'

export async function sendMail({
  fromEmail,
  toEmails,
  subject,
  html,
}: {
  fromEmail: string
  toEmails:  string[]
  subject:   string
  html:      string
}) {
  if (!toEmails.length) return

  const token = await getAppToken()

  const res = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(fromEmail)}/sendMail`,
    {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          subject,
          body: { contentType: 'HTML', content: html },
          toRecipients: toEmails.map(address => ({ emailAddress: { address } })),
        },
        saveToSentItems: false,
      }),
    }
  )

  if (!res.ok) {
    const err = await res.text()
    console.error(`[mail] Error enviando correo (${res.status}):`, err)
    throw new Error(`Graph Mail error ${res.status}: ${err}`)
  }
}

/* ─── Templates ─── */

export function templateNuevaSolicitud({
  solicitanteNombre,
  solicitanteEmail,
  eventoNombre,
  funcion,
  numPersonas,
  fechaInicioLabor,
  fechaFinLabor,
}: {
  solicitanteNombre: string
  solicitanteEmail:  string
  eventoNombre:      string
  funcion:           string
  numPersonas:       number
  fechaInicioLabor:  string
  fechaFinLabor:     string
}) {
  const dias = Math.ceil(
    (new Date(fechaFinLabor).getTime() - new Date(fechaInicioLabor).getTime()) / (1000 * 60 * 60 * 24)
  ) + 1

  return `
  <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#111">
    <div style="background:#111;padding:24px 32px;border-radius:12px 12px 0 0">
      <h2 style="color:#fff;margin:0;font-size:18px">Magic Dreams Productions</h2>
    </div>
    <div style="border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;padding:32px">
      <h3 style="margin:0 0 16px;font-size:16px">📋 Nueva solicitud de personal</h3>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <tr><td style="padding:8px 0;color:#6b7280;width:140px">Solicitante</td><td style="padding:8px 0;font-weight:600">${solicitanteNombre}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280">Correo</td><td style="padding:8px 0">${solicitanteEmail}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280">Evento</td><td style="padding:8px 0;font-weight:600">${eventoNombre}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280">Función</td><td style="padding:8px 0">${funcion}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280">Personas</td><td style="padding:8px 0">${numPersonas}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280">Fechas de labor</td><td style="padding:8px 0">${new Date(fechaInicioLabor).toLocaleDateString('es-PA')} – ${new Date(fechaFinLabor).toLocaleDateString('es-PA')} <span style="color:#d97706">(${dias} día(s))</span></td></tr>
      </table>
      <div style="margin-top:24px">
        <a href="${process.env.NEXTAUTH_URL}/admin/solicitudes" style="background:#111;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600">
          Revisar solicitud →
        </a>
      </div>
    </div>
  </div>`
}

export function templateRespuestaSolicitud({
  solicitanteNombre,
  eventoNombre,
  estado,
  funcion,
  numPersonas,
  costoTotal,
  notaAdmin,
  adminNombre,
}: {
  solicitanteNombre: string
  eventoNombre:      string
  estado:            'APROBADA' | 'RECHAZADA'
  funcion:           string
  numPersonas:       number
  costoTotal:        number | null
  notaAdmin:         string | null
  adminNombre:       string
}) {
  const aprobada   = estado === 'APROBADA'
  const colorBorde = aprobada ? '#22c55e' : '#ef4444'
  const emoji      = aprobada ? '✅' : '❌'
  const textoEstado = aprobada ? 'aprobada' : 'rechazada'

  return `
  <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#111">
    <div style="background:#111;padding:24px 32px;border-radius:12px 12px 0 0">
      <h2 style="color:#fff;margin:0;font-size:18px">Magic Dreams Productions</h2>
    </div>
    <div style="border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;padding:32px">
      <div style="border-left:4px solid ${colorBorde};padding-left:16px;margin-bottom:24px">
        <h3 style="margin:0 0 4px;font-size:16px">${emoji} Tu solicitud fue ${textoEstado}</h3>
        <p style="margin:0;color:#6b7280;font-size:14px">Hola ${solicitanteNombre}, aquí el detalle:</p>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <tr><td style="padding:8px 0;color:#6b7280;width:140px">Evento</td><td style="padding:8px 0;font-weight:600">${eventoNombre}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280">Función</td><td style="padding:8px 0">${funcion}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280">Personas</td><td style="padding:8px 0">${numPersonas}</td></tr>
        ${aprobada && costoTotal ? `<tr><td style="padding:8px 0;color:#6b7280">Costo aprobado</td><td style="padding:8px 0;font-weight:600;color:#d97706">$${costoTotal.toFixed(2)}</td></tr>` : ''}
        ${notaAdmin ? `<tr><td style="padding:8px 0;color:#6b7280;vertical-align:top">Nota del admin</td><td style="padding:8px 0;font-style:italic">"${notaAdmin}"</td></tr>` : ''}
        <tr><td style="padding:8px 0;color:#6b7280">Revisado por</td><td style="padding:8px 0">${adminNombre}</td></tr>
      </table>
      <div style="margin-top:24px">
        <a href="${process.env.NEXTAUTH_URL}/usuario/solicitar" style="background:#111;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600">
          Ver mis solicitudes →
        </a>
      </div>
    </div>
  </div>`
}

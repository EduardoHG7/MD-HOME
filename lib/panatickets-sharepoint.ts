// Descarga el Excel de tesorería de Panatickets desde su propio Microsoft 365
// (tenant separado del de Magic Dreams) vía Graph API app-only.

const TENANT_ID = process.env.PANATICKETS_SHAREPOINT_TENANT_ID!
const CLIENT_ID = process.env.PANATICKETS_SHAREPOINT_CLIENT_ID!
const CLIENT_SECRET = process.env.PANATICKETS_SHAREPOINT_CLIENT_SECRET!

const UPN = 'ydelegado@panatickets.com'
const FILE_PATH =
  'CONTA PANATICKETS/INFORMES DE TESORERIA 2026/Dashboard Tesoreria/Reporte Tesoreria - Dashboard.xlsx'

let cachedToken: { value: string; expiresAt: number } | null = null

async function getToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value
  }
  const res = await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      scope: 'https://graph.microsoft.com/.default',
    }),
  })
  const data = await res.json()
  if (!res.ok) {
    throw new Error(`Error token Panatickets SharePoint (${res.status}): ${JSON.stringify(data)}`)
  }
  cachedToken = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 }
  return cachedToken.value
}

export async function downloadPanaticketsFinanzasExcel(): Promise<Buffer> {
  const token = await getToken()
  const encodedPath = FILE_PATH.split('/').map(encodeURIComponent).join('/')
  const url = `https://graph.microsoft.com/v1.0/users/${UPN}/drive/root:/${encodedPath}:/content`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Error descargando Excel de Panatickets (${res.status}): ${err}`)
  }
  return Buffer.from(await res.arrayBuffer())
}

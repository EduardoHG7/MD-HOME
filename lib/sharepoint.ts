// Utilidad para subir archivos a SharePoint via Microsoft Graph API (app-only)

const TENANT_ID    = process.env.AZURE_AD_TENANT_ID!
const CLIENT_ID    = process.env.AZURE_AD_CLIENT_ID!
const CLIENT_SECRET = process.env.AZURE_AD_CLIENT_SECRET!
const SP_HOST      = process.env.SHAREPOINT_HOST!       // magicdreamspty.sharepoint.com
const SP_SITE_PATH = process.env.SHAREPOINT_SITE_PATH!  // /sites/RegistrodeFacturas

let cachedToken: { value: string; expiresAt: number } | null = null

async function getAppToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value
  }

  const res = await fetch(
    `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type:    'client_credentials',
        client_id:     CLIENT_ID,
        client_secret: CLIENT_SECRET,
        scope:         'https://graph.microsoft.com/.default',
      }),
    }
  )

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Error obteniendo token de SharePoint: ${err}`)
  }

  const data = await res.json()
  cachedToken = {
    value:     data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  }
  return cachedToken.value
}

async function getSiteId(): Promise<string> {
  const token = await getAppToken()
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${SP_HOST}:${SP_SITE_PATH}`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  if (!res.ok) throw new Error('No se pudo obtener el Site ID de SharePoint')
  const data = await res.json()
  return data.id
}

/**
 * Sube un archivo a SharePoint y retorna la URL de descarga directa
 * @param folderPath  Ruta dentro del drive, ej: "AplicanteFotos/8-123-456/foto.jpg"
 * @param buffer      Buffer del archivo
 * @param mimeType    MIME type del archivo
 */
export async function uploadToSharePoint(
  folderPath: string,
  buffer: Buffer,
  mimeType: string
): Promise<string> {
  const token  = await getAppToken()
  const siteId = await getSiteId()

  const uploadUrl = `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root:/${folderPath}:/content`

  const res = await fetch(uploadUrl, {
    method:  'PUT',
    headers: {
      Authorization:  `Bearer ${token}`,
      'Content-Type': mimeType,
    },
    body: buffer,
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Error subiendo a SharePoint: ${err}`)
  }

  const data = await res.json()
  // Retornar URL de descarga directa (funciona con token de Graph)
  return data['@microsoft.graph.downloadUrl'] ?? data.webUrl
}

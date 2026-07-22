// Utilidad para subir archivos a SharePoint via Microsoft Graph API (app-only)

const TENANT_ID    = process.env.SHAREPOINT_TENANT_ID ?? process.env.AZURE_AD_TENANT_ID!
const CLIENT_ID    = process.env.AZURE_AD_CLIENT_ID!
const CLIENT_SECRET = process.env.AZURE_AD_CLIENT_SECRET!
const SP_HOST      = process.env.SHAREPOINT_HOST!       // magicdreamspty.sharepoint.com
const SP_SITE_PATH = process.env.SHAREPOINT_SITE_PATH!  // /sites/RegistrodeFacturas

let cachedToken: { value: string; expiresAt: number } | null = null

async function fetchNewToken(): Promise<string> {
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
    throw new Error(`Error token SharePoint (${res.status}): ${err}`)
  }

  const data = await res.json()
  cachedToken = {
    value:     data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  }
  return cachedToken.value
}

export async function getAppToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value
  }
  return fetchNewToken()
}

/**
 * Llama a Graph con el token cacheado. Si Graph responde 401 (el token quedó
 * inválido pese a que nuestro reloj local lo daba por vigente — puede pasar
 * si una función serverless queda "tibia" mucho tiempo), se pide un token
 * nuevo forzado y se reintenta una sola vez antes de rendirse.
 */
async function graphFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const doFetch = (token: string) =>
    fetch(url, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` } })

  let res = await doFetch(await getAppToken())
  if (res.status === 401) {
    cachedToken = null // invalida el caché: fetchNewToken pide uno nuevo sí o sí
    res = await doFetch(await fetchNewToken())
  }
  return res
}

export async function getSiteId(): Promise<string> {
  const url = `https://graph.microsoft.com/v1.0/sites/${SP_HOST}:${SP_SITE_PATH}`
  const res = await graphFetch(url)
  const data = await res.json()
  if (!res.ok) {
    throw new Error(`SharePoint Site ID error (${res.status}): ${JSON.stringify(data)}`)
  }
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
  const siteId = await getSiteId()

  // @microsoft.graph.conflictBehavior=replace → sobreescribe si ya existe el archivo
  const uploadUrl = `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root:/${folderPath}:/content?@microsoft.graph.conflictBehavior=replace`

  const res = await graphFetch(uploadUrl, {
    method:  'PUT',
    headers: { 'Content-Type': mimeType },
    body:    new Uint8Array(buffer),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Error subiendo a SharePoint: ${err}`)
  }

  await res.json()
  // Retornar solo la ruta dentro del drive (para usar con el proxy interno)
  return folderPath
}

/**
 * Descarga el contenido de un archivo de SharePoint usando token de app
 */
export async function downloadFromSharePoint(filePath: string): Promise<{ buffer: ArrayBuffer; contentType: string }> {
  const siteId = await getSiteId()

  const url = `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root:/${filePath}:/content`
  const res = await graphFetch(url)

  if (!res.ok) {
    const err = await res.text()
    console.error(`[sharepoint] Error descargando "${filePath}" (${res.status}):`, err)
    throw new Error(`Error descargando de SharePoint (${res.status}): ${err}`)
  }

  const buffer      = await res.arrayBuffer()
  const contentType = res.headers.get('content-type') ?? 'image/jpeg'
  return { buffer, contentType }
}

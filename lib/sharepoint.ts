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

  // Diagnóstico: si Graph sigue rechazando el token como "expirado" pese a
  // ser recién emitido, esto muestra si el problema es una política de Azure
  // (Conditional Access / Token Lifetime) que le está poniendo una vida útil
  // rota, comparando lo que dice el propio token contra la hora real.
  try {
    const payload = JSON.parse(Buffer.from(data.access_token.split('.')[1], 'base64').toString())
    console.error('[sharepoint] Token emitido — iat:', new Date(payload.iat * 1000).toISOString(),
      'exp:', new Date(payload.exp * 1000).toISOString(),
      'ahora:', new Date().toISOString(),
      'aud:', payload.aud, 'appid:', payload.appid, 'tid:', payload.tid)
  } catch (e) {
    console.error('[sharepoint] No se pudo decodificar el token para diagnóstico:', e)
  }

  return cachedToken.value
}

export async function getAppToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value
  }
  return fetchNewToken()
}

const espera = (ms: number) => new Promise(r => setTimeout(r, ms))

/**
 * Llama a Graph con el token cacheado. Si Graph responde 401 con un token
 * recién emitido (ver diagnóstico en fetchNewToken), esto no es un problema
 * real de vigencia de nuestro token — se ve sobre todo justo después de subir
 * un archivo (p.ej. al firmar un contrato y descargarlo enseguida), lo que
 * apunta a que SharePoint aún no terminó de propagar/indexar el archivo
 * recién escrito y devuelve un 401 transitorio con forma de "token expirado".
 * Por eso se reintenta varias veces con espera creciente, no solo una vez.
 *
 * Para :/content, Graph a veces responde con una redirección a la URL real
 * de almacenamiento (con su propio token embebido en el query string). Si
 * reenviamos nuestro Authorization: Bearer en esa segunda petición, el
 * backend de almacenamiento a veces lo rechaza como "expirado" — un error
 * engañoso que no tiene que ver con la vigencia real de nuestro token de
 * Graph. Por eso seguimos la redirección a mano, sin el header.
 */
async function graphFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const doFetch = async (token: string) => {
    let res = await fetch(url, {
      ...init,
      headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` },
      redirect: 'manual',
    })
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location')
      if (location) res = await fetch(location, { method: init.method ?? 'GET' })
    }
    return res
  }

  let res = await doFetch(await getAppToken())
  const esperas = [500, 1500, 3000]
  for (let i = 0; res.status === 401 && i < esperas.length; i++) {
    console.error(`[sharepoint] 401 en ${url} — reintento ${i + 1}/${esperas.length} tras ${esperas[i]}ms`)
    await espera(esperas[i])
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

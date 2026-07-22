// Utilidad para subir archivos a SharePoint via Microsoft Graph API (app-only)

const TENANT_ID    = process.env.SHAREPOINT_TENANT_ID ?? process.env.AZURE_AD_TENANT_ID!
const CLIENT_ID    = process.env.AZURE_AD_CLIENT_ID!
const CLIENT_SECRET = process.env.AZURE_AD_CLIENT_SECRET!
const SP_HOST      = process.env.SHAREPOINT_HOST!       // magicdreamspty.sharepoint.com
const SP_SITE_PATH = process.env.SHAREPOINT_SITE_PATH!  // /sites/RegistrodeFacturas

let cachedToken: { value: string; expiresAt: number } | null = null
let cachedSiteId: string | null = null

/**
 * Se confirmó (ver logs de producción del 2026-07-22) que Azure AD a veces
 * responde a /oauth2/v2.0/token con un access_token que su propio claim
 * "exp" indica que ya venció hace rato (visto: emitido y vencido más de una
 * hora antes de recibirlo) — es decir, el endpoint de token sirve un token
 * viejo desde su propia caché interna en vez de emitir uno real. Graph
 * después lo rechaza, obviamente, con "Lifetime validation failed". No es
 * algo que dependa de nuestro caché ni de nuestro reloj: hay que validar el
 * "exp" real del JWT que Azure devuelve y, si ya venció, no usarlo y volver
 * a pedir otro en vez de confiar en que "recién emitido" == "válido".
 */
async function fetchNewToken(intentosRestantes = 4): Promise<string> {
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

  let payload: { iat: number; exp: number; aud?: string; appid?: string; tid?: string } | null = null
  try {
    payload = JSON.parse(Buffer.from(data.access_token.split('.')[1], 'base64').toString())
  } catch (e) {
    console.error('[sharepoint] No se pudo decodificar el token para diagnóstico:', e)
  }

  const ahora = Date.now()
  if (payload) {
    console.error('[sharepoint] Token emitido — iat:', new Date(payload.iat * 1000).toISOString(),
      'exp:', new Date(payload.exp * 1000).toISOString(),
      'ahora:', new Date(ahora).toISOString(),
      'aud:', payload.aud, 'appid:', payload.appid, 'tid:', payload.tid)
  }

  // Azure devolvió un token cuyo propio "exp" ya pasó (o está por pasar):
  // no sirve, no lo cacheamos ni lo usamos. Reintentamos pedir otro.
  if (payload && payload.exp * 1000 <= ahora + 60_000) {
    console.error('[sharepoint] Azure devolvió un access_token ya vencido (posible caché stale de Azure AD).',
      intentosRestantes > 0 ? `Reintentando (${intentosRestantes} intentos restantes)…` : 'Sin más reintentos.')
    if (intentosRestantes > 0) {
      await espera(1000)
      return fetchNewToken(intentosRestantes - 1)
    }
    throw new Error(
      'Azure AD sigue devolviendo tokens ya vencidos para esta app (problema del lado de Microsoft, ' +
      'no de la app). Puede requerir revisar el estado del servicio en Entra/Microsoft 365 o abrir un caso de soporte.'
    )
  }

  cachedToken = {
    value:     data.access_token,
    expiresAt: payload ? payload.exp * 1000 : ahora + data.expires_in * 1000,
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
  // Ventana de reintento generosa (~20s en total): el 401 "expirado" con un
  // token recién emitido se ha visto ser transitorio (propagación en
  // SharePoint), y las rutas que llaman a esto tienen maxDuration de 30-60s.
  const esperas = [500, 1500, 3000, 5000, 8000]
  for (let i = 0; res.status === 401 && i < esperas.length; i++) {
    console.error(
      `[sharepoint] 401 en ${url} — reintento ${i + 1}/${esperas.length} tras ${esperas[i]}ms.`,
      'date (Graph):', res.headers.get('date'),
      'request-id:', res.headers.get('request-id') ?? res.headers.get('client-request-id'),
      'www-authenticate:', res.headers.get('www-authenticate'),
    )
    await espera(esperas[i])
    cachedToken = null // invalida el caché: fetchNewToken pide uno nuevo sí o sí
    cachedSiteId = null // por si el 401 vino de una llamada que dependía de un siteId obtenido con el token viejo
    res = await doFetch(await fetchNewToken())
  }
  return res
}

export async function getSiteId(): Promise<string> {
  if (cachedSiteId) return cachedSiteId

  const url = `https://graph.microsoft.com/v1.0/sites/${SP_HOST}:${SP_SITE_PATH}`
  const res = await graphFetch(url)
  const data = await res.json()
  if (!res.ok) {
    throw new Error(`SharePoint Site ID error (${res.status}): ${JSON.stringify(data)}`)
  }
  cachedSiteId = data.id
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

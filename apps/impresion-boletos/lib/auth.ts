// Sesión de admin simple: una cookie firmada con HMAC-SHA256 (Web Crypto,
// funciona tanto en middleware/edge como en route handlers).
// No hay usuarios ni base de datos de sesiones: una sola contraseña de admin
// (ADMIN_PASSWORD) es suficiente para este panel interno de operación.

export const SESSION_COOKIE = 'ib_session'
const SESSION_TTL_MS = 1000 * 60 * 60 * 12 // 12 horas

function getSecret(): string {
  const secret = process.env.SESSION_SECRET
  if (!secret) throw new Error('Falta la variable de entorno SESSION_SECRET')
  return secret
}

async function hmac(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(getSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
  return Buffer.from(sig).toString('base64url')
}

export async function createSessionToken(): Promise<string> {
  const expires = Date.now() + SESSION_TTL_MS
  const payload = `${expires}`
  const sig = await hmac(payload)
  return `${payload}.${sig}`
}

export async function isValidSessionToken(token: string | undefined | null): Promise<boolean> {
  if (!token) return false
  const [payload, sig] = token.split('.')
  if (!payload || !sig) return false
  const expected = await hmac(payload)
  if (expected !== sig) return false
  const expires = Number(payload)
  if (!Number.isFinite(expires) || Date.now() > expires) return false
  return true
}

export function checkAdminPassword(password: string): boolean {
  const expected = process.env.ADMIN_PASSWORD
  if (!expected) throw new Error('Falta la variable de entorno ADMIN_PASSWORD')
  return password === expected
}

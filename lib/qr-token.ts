import { totp } from 'otplib'

// Token válido por 30 segundos - si capturas pantalla ya expiró antes de que lo uses
const STEP = 30

totp.options = {
  step: STEP,
  window: 1, // acepta 1 paso anterior/siguiente por latencia de red
}

export function generateQRToken(secret: string): string {
  return totp.generate(secret)
}

export function validateQRToken(token: string, secret: string): boolean {
  return totp.check(token, secret)
}

export function secondsUntilRefresh(): number {
  return STEP - (Math.floor(Date.now() / 1000) % STEP)
}

export function buildQRContent(
  applicantId: string,
  eventId: string,
  token: string,
  baseUrl: string
): string {
  return `${baseUrl}/api/asistencia/scan?aid=${applicantId}&eid=${eventId}&t=${token}`
}

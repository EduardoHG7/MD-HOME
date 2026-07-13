// Operador de Panatickets: usuario (no admin) con correo @panatickets.com.
// Recibe la visual de admin acotada a la sección Eventos (crear evento y
// cargar documentos), no el resto del panel.
const DOMINIO_PANATICKETS = '@panatickets.com'

export function esOperadorPanatickets(email?: string | null, role?: string | null): boolean {
  if (role === 'ADMIN') return false
  return typeof email === 'string' && email.toLowerCase().endsWith(DOMINIO_PANATICKETS)
}

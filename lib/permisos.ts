// Operador de Panatickets: usuario (no admin) con correo @panatickets.com.
// Recibe la visual de admin acotada a la sección Eventos (crear evento y
// cargar documentos), no el resto del panel.
const DOMINIO_PANATICKETS = '@panatickets.com'

export function esOperadorPanatickets(email?: string | null, role?: string | null): boolean {
  if (role === 'ADMIN') return false
  return typeof email === 'string' && email.toLowerCase().endsWith(DOMINIO_PANATICKETS)
}

// Acceso al dashboard de Finanzas Panatickets: nadie lo tiene por rol, ni
// siquiera ADMIN — solo quien un admin haya seleccionado explícitamente
// (User.puedeVerFinanzas), vía Gestión de Usuarios.
export function puedeVerFinanzas(user: { puedeVerFinanzas: boolean }): boolean {
  return user.puedeVerFinanzas
}

// Dominio de correo corporativo del holding — lo comparten varias empresas
// (Panatickets, Print Media, etc.), así que por sí solo NO identifica a un
// operador de Panatickets. Solo se usa como último recurso en lib/auth.ts
// para el personal eventual que aún no fue asignado a ninguna empresa vía
// Gestión de Usuarios.
const DOMINIO_PANATICKETS = '@panatickets.com'

export function emailDominioPanatickets(email?: string | null): boolean {
  return typeof email === 'string' && email.toLowerCase().endsWith(DOMINIO_PANATICKETS)
}

// Operador de Panatickets: personal eventual sin asignación explícita a
// ninguna empresa, acotado por defecto a Panatickets (ver lib/auth.ts).
// Se identifica por el resultado ya resuelto en `availableTenants` — nunca
// por el dominio del correo, ya que un empleado de otra empresa del holding
// (p. ej. Print Media) puede compartir ese mismo dominio corporativo sin ser
// un operador de Panatickets.
export function esOperadorPanatickets(
  availableTenants?: { slug: string }[] | null,
  role?: string | null,
): boolean {
  if (role === 'ADMIN') return false
  return (availableTenants?.length ?? 0) === 1 && availableTenants![0]?.slug === 'panatickets'
}

// Acceso al dashboard de Finanzas Panatickets: nadie lo tiene por rol, ni
// siquiera ADMIN — solo quien un admin haya seleccionado explícitamente
// (User.puedeVerFinanzas), vía Gestión de Usuarios.
export function puedeVerFinanzas(user: { puedeVerFinanzas: boolean }): boolean {
  return user.puedeVerFinanzas
}

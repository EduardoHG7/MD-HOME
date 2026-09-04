import { prisma } from './prisma'

export type RolAprobacion = 'RECEPTOR_SOLICITUD' | 'APROBADOR' | 'RECEPTOR_RESPUESTA'

export interface UsuarioNotificable {
  id: string
  name: string | null
  email: string
  telefono: string | null
}

async function usuariosPorRol(tenantId: string, rol: RolAprobacion): Promise<UsuarioNotificable[]> {
  const config = await prisma.aprobacionConfig.findUnique({
    where: { tenantId },
    include: { usuarios: { where: { rol }, include: { user: { select: { id: true, name: true, email: true, telefono: true } } } } },
  })
  return config?.usuarios.map(u => u.user) ?? []
}

// Un evento puede pertenecer a varias empresas — se unen los configurados en
// cada una, sin duplicados.
async function usuariosPorRolMultiTenant(tenantIds: string[], rol: RolAprobacion): Promise<UsuarioNotificable[]> {
  const listas = await Promise.all(Array.from(new Set(tenantIds)).map(id => usuariosPorRol(id, rol)))
  const vistos = new Set<string>()
  const resultado: UsuarioNotificable[] = []
  for (const lista of listas) {
    for (const u of lista) {
      if (!vistos.has(u.id)) { vistos.add(u.id); resultado.push(u) }
    }
  }
  return resultado
}

// A quién avisar cuando hay algo nuevo pendiente de aprobación. Si ninguna
// de estas empresas tiene configuración, usa `fallback` (comportamiento
// previo de cada flujo: los ADMIN de la empresa, o un filtro por dominio).
export async function receptoresSolicitud(
  tenantIds: string[],
  fallback: () => Promise<UsuarioNotificable[]>,
): Promise<UsuarioNotificable[]> {
  const configurados = await usuariosPorRolMultiTenant(tenantIds, 'RECEPTOR_SOLICITUD')
  return configurados.length ? configurados : fallback()
}

// A quién avisar el resultado (aprobado/rechazado). Sin configuración, cada
// flujo sigue avisando solo a quien lo creó (comportamiento previo).
export async function receptoresRespuesta(
  tenantIds: string[],
  fallback: () => Promise<UsuarioNotificable[]>,
): Promise<UsuarioNotificable[]> {
  const configurados = await usuariosPorRolMultiTenant(tenantIds, 'RECEPTOR_RESPUESTA')
  return configurados.length ? configurados : fallback()
}

// ¿Puede este usuario aprobar/rechazar en alguna de estas empresas? ADMIN
// siempre puede. Si alguna empresa tiene aprobadores configurados, también
// puede aprobar quien esté en esa lista aunque no sea ADMIN. Sin
// configuración, se exige ADMIN (comportamiento previo).
export async function puedeAprobar(tenantIds: string[], user: { id: string; role: string }): Promise<boolean> {
  if (user.role === 'ADMIN') return true
  if (tenantIds.length === 0) return false
  const aprobadores = await usuariosPorRolMultiTenant(tenantIds, 'APROBADOR')
  return aprobadores.some(a => a.id === user.id)
}

// Empresas donde este usuario (no-admin) fue designado aprobador — para
// ampliar los filtros "ver todo" de las listas de pendientes más allá de
// "soy ADMIN".
export async function tenantsDondeApruebo(userId: string): Promise<string[]> {
  const roles = await prisma.aprobacionConfigUsuario.findMany({
    where: { userId, rol: 'APROBADOR' },
    select: { config: { select: { tenantId: true } } },
  })
  return roles.map(r => r.config.tenantId)
}

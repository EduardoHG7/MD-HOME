import { prisma } from '@/lib/prisma'
import { esOperadorPanatickets } from '@/lib/permisos'

// ¿Puede este usuario gestionar el expediente (documentos, logística) de este evento?
// Admin, el responsable de documentación, o —en eventos Panatickets— el operador
// @panatickets.com o cualquier miembro de la empresa Panatickets.
export async function puedeGestionarExpediente(
  eventoId: string, userId: string, role: string, email?: string | null,
): Promise<boolean> {
  if (role === 'ADMIN') return true
  const evento = await prisma.evento.findUnique({
    where: { id: eventoId },
    select: {
      docsResponsableId: true,
      tenants: { select: { tenant: { select: { id: true, slug: true } } } },
    },
  })
  if (!evento) return false
  if (evento.docsResponsableId === userId) return true

  const pana = evento.tenants.find(t => t.tenant.slug === 'panatickets')
  if (!pana) return false
  if (esOperadorPanatickets(email, role)) return true
  const pertenece = await prisma.userTenant.findUnique({
    where: { userId_tenantId: { userId, tenantId: pana.tenant.id } },
  })
  return Boolean(pertenece)
}

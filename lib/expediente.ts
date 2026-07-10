import { prisma } from '@/lib/prisma'
import { notificarPorRol } from '@/lib/notificaciones'

// Documentos que el usuario sube en el expediente Panatickets (los 5 slots)
const DOCS_REQUERIDOS = ['AVISO_OPERACIONES', 'CEDULA_REP_LEGAL', 'CIERRE', 'GASTOS', 'PLANILLA']

/**
 * Si un evento de Panatickets ya tiene todo el expediente cargado por el
 * usuario (5 documentos + formulario + contrato subido) y solo falta la firma
 * del gerente, avisa a los admins por WhatsApp — una sola vez.
 * Fire-and-forget: cualquier error se loguea y no interrumpe el flujo.
 */
export async function notificarExpedienteListo(eventoId: string): Promise<void> {
  try {
    const evento = await prisma.evento.findUnique({
      where: { id: eventoId },
      select: {
        nombre: true,
        expedienteNotificado: true,
        tenants: { select: { tenant: { select: { slug: true } } } },
        documentos: { select: { tipo: true } },
        contrato: { select: { id: true } },
        formularioComprobantes: { select: { razonSocial: true, rucDv: true } },
      },
    })
    if (!evento || evento.expedienteNotificado) return
    if (!evento.tenants.some(t => t.tenant.slug === 'panatickets')) return

    const tipos = new Set(evento.documentos.map(d => d.tipo))
    const docsOk = DOCS_REQUERIDOS.every(t => tipos.has(t))
    const formOk = Boolean(evento.formularioComprobantes?.razonSocial && evento.formularioComprobantes?.rucDv)
    const contratoOk = Boolean(evento.contrato)
    if (!docsOk || !formOk || !contratoOk) return

    // Marcar primero (evita doble notificación por dos subidas casi simultáneas)
    const upd = await prisma.evento.updateMany({
      where: { id: eventoId, expedienteNotificado: false },
      data: { expedienteNotificado: true },
    })
    if (upd.count === 0) return // otro request ya notificó

    const appUrl = process.env.NEXTAUTH_URL ?? ''
    await notificarPorRol(
      ['ADMIN'],
      `✅ *Expediente completo — listo para firma*\n\nEvento: ${evento.nombre}\nEl usuario ya subió todos los documentos y el contrato. Solo falta tu firma.\n\nEntra a firmar: ${appUrl}/admin/eventos/${eventoId}/documentos`
    )
  } catch (err) {
    console.error('[expediente] Error notificando expediente listo:', err)
  }
}

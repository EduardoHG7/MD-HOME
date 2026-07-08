// Notificaciones internas por WhatsApp a usuarios según su rol
import { prisma } from '@/lib/prisma'
import { sendWhatsApp } from '@/lib/whatsapp'

/**
 * Envía un WhatsApp a todos los usuarios con alguno de los roles indicados
 * que tengan teléfono registrado. Fire-and-forget: los errores se loguean
 * pero no interrumpen el flujo que dispara la notificación.
 */
export async function notificarPorRol(roles: string[], mensaje: string): Promise<void> {
  try {
    const usuarios = await prisma.user.findMany({
      where: { role: { in: roles }, telefono: { not: null } },
      select: { telefono: true, name: true },
    })

    await Promise.allSettled(
      usuarios
        .filter(u => u.telefono)
        .map(u => sendWhatsApp(u.telefono!, mensaje).catch(err =>
          console.error(`[notificaciones] Error enviando a ${u.name}:`, err)
        ))
    )
  } catch (err) {
    console.error('[notificaciones] Error:', err)
  }
}

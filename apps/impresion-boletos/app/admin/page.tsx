import Link from 'next/link'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

function Badge({ estado }: { estado: string }) {
  const styles: Record<string, string> = {
    IMPRESO: 'bg-green-500/20 text-green-400',
    PENDIENTE: 'bg-yellow-500/20 text-yellow-400',
    INVALIDO: 'bg-red-500/20 text-red-400',
  }
  return <span className={`text-xs px-2 py-0.5 rounded-full ${styles[estado] ?? 'bg-white/10 text-gray-300'}`}>{estado}</span>
}

export default async function AdminDashboard() {
  const [puntos, recientes] = await Promise.all([
    prisma.punto.findMany({ include: { _count: { select: { boletos: true } } } }),
    prisma.boleto.findMany({ orderBy: { createdAt: 'desc' }, take: 25, include: { punto: true } }),
  ])

  const activos = puntos.filter((p) => p.activo).length

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-white/10 p-4">
          <p className="text-sm text-gray-400">Puntos de impresión</p>
          <p className="text-3xl font-semibold text-white">
            {activos} <span className="text-base text-gray-500">/ {puntos.length}</span>
          </p>
        </div>
        <div className="rounded-xl border border-white/10 p-4">
          <p className="text-sm text-gray-400">Boletos recibidos</p>
          <p className="text-3xl font-semibold text-white">{puntos.reduce((sum, p) => sum + p._count.boletos, 0)}</p>
        </div>
        <div className="rounded-xl border border-white/10 p-4">
          <Link href="/admin/puntos" className="text-brand-400 hover:text-brand-300 text-sm">
            + Crear un nuevo punto de impresión
          </Link>
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold text-white mb-3">Actividad reciente</h2>
        {recientes.length === 0 ? (
          <p className="text-gray-400 text-sm">Todavía no se ha recibido ningún boleto.</p>
        ) : (
          <div className="rounded-xl border border-white/10 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-white/5 text-gray-400 text-left">
                <tr>
                  <th className="px-3 py-2">Hora</th>
                  <th className="px-3 py-2">Punto</th>
                  <th className="px-3 py-2">Nombre</th>
                  <th className="px-3 py-2">Evento</th>
                  <th className="px-3 py-2">Estado</th>
                </tr>
              </thead>
              <tbody>
                {recientes.map((b) => (
                  <tr key={b.id} className="border-t border-white/10">
                    <td className="px-3 py-2 text-gray-400">{new Date(b.createdAt).toLocaleString('es-PA')}</td>
                    <td className="px-3 py-2">{b.punto.nombre}</td>
                    <td className="px-3 py-2">{[b.nombre, b.apellido].filter(Boolean).join(' ') || '—'}</td>
                    <td className="px-3 py-2">{b.evento ?? '—'}</td>
                    <td className="px-3 py-2">
                      <Badge estado={b.estado} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

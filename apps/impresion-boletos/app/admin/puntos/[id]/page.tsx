import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import PuntoActions from './PuntoActions'

export const dynamic = 'force-dynamic'

export default async function PuntoDetailPage({ params }: { params: { id: string } }) {
  const punto = await prisma.punto.findUnique({
    where: { id: params.id },
    include: { boletos: { orderBy: { createdAt: 'desc' }, take: 30 } },
  })
  if (!punto) notFound()

  const host = headers().get('host')
  const proto = headers().get('x-forwarded-proto') ?? 'https'
  const origin = host ? `${proto}://${host}` : ''

  const webhookUrl = `${origin}/api/webhook/${punto.token}`
  const kioskUrl = `${origin}/punto/${punto.token}`

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-semibold text-white">{punto.nombre}</h1>
        <p className="text-sm text-gray-400">Configura este punto en CodeREADr y abre la pantalla de impresión en la compu conectada a su impresora.</p>
      </div>

      <PuntoActions puntoId={punto.id} nombre={punto.nombre} activo={punto.activo} webhookUrl={webhookUrl} kioskUrl={kioskUrl} />

      <div>
        <h2 className="text-lg font-semibold text-white mb-3">Últimos boletos en este punto</h2>
        {punto.boletos.length === 0 ? (
          <p className="text-sm text-gray-400">Todavía no se ha recibido ningún boleto aquí.</p>
        ) : (
          <div className="rounded-xl border border-white/10 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-white/5 text-gray-400 text-left">
                <tr>
                  <th className="px-3 py-2">Hora</th>
                  <th className="px-3 py-2">Nombre</th>
                  <th className="px-3 py-2">Evento</th>
                  <th className="px-3 py-2">Código</th>
                  <th className="px-3 py-2">Estado</th>
                </tr>
              </thead>
              <tbody>
                {punto.boletos.map((b) => (
                  <tr key={b.id} className="border-t border-white/10">
                    <td className="px-3 py-2 text-gray-400">{new Date(b.createdAt).toLocaleString('es-PA')}</td>
                    <td className="px-3 py-2">{[b.nombre, b.apellido].filter(Boolean).join(' ') || '—'}</td>
                    <td className="px-3 py-2">{b.evento ?? '—'}</td>
                    <td className="px-3 py-2 text-gray-400">{b.codigo ?? '—'}</td>
                    <td className="px-3 py-2">{b.estado}</td>
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

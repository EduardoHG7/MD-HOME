'use client'

import { useState } from 'react'
import { useTenant } from '@/hooks/useTenant'
import { CotizadorForm } from '@/components/pm/CotizadorForm'
import { HistorialCotizacionesPM } from '@/components/pm/HistorialCotizacionesPM'

type Tab = 'cotizacion' | 'historial'

export default function CotizacionesPMUsuarioPage() {
  const { activeTenant } = useTenant()
  const [tab, setTab] = useState<Tab>('cotizacion')
  const [refresh, setRefresh] = useState(0)

  if (activeTenant && activeTenant.slug !== 'printmediapty') {
    return (
      <div className="card p-8 text-center">
        <p className="text-3xl mb-3">🔒</p>
        <p className="text-gray-700 font-semibold">El cotizador es exclusivo de Print Media PTY.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Cotizador de Print Media</h1>
        <p className="text-gray-500 mt-1">Cotizaciones de venta a clientes — banners, vinil, mesh y letreros</p>
      </div>

      <div className="flex gap-1 bg-gray-100 rounded-2xl p-1 w-fit">
        <button onClick={() => setTab('cotizacion')}
          className={`px-5 py-2 rounded-xl text-sm font-medium transition-all ${tab === 'cotizacion' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
          Cotización
        </button>
        <button onClick={() => setTab('historial')}
          className={`px-5 py-2 rounded-xl text-sm font-medium transition-all ${tab === 'historial' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
          Historial
        </button>
      </div>

      {tab === 'cotizacion' && <CotizadorForm onCreated={() => { setTab('historial'); setRefresh(r => r + 1) }} />}
      {tab === 'historial'  && <HistorialCotizacionesPM key={refresh} esAdmin={false} />}
    </div>
  )
}

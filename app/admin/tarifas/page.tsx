'use client'

import { useEffect, useState } from 'react'
import { TARIFA_LABELS, formatCurrency } from '@/lib/utils'

interface Tarifa { id: string; tipo: string; precioPorDia: number }

const TIPOS: Array<{ tipo: string; desc: string; icon: string }> = [
  { tipo: 'DIARIA',    desc: 'Pago por cada día trabajado, sin compromiso de continuidad.', icon: '📅' },
  { tipo: 'QUINCENAL', desc: 'Colaborador disponible durante una quincena de eventos.',      icon: '📆' },
  { tipo: 'MENSUAL',   desc: 'Colaborador disponible por un mes completo de eventos.',       icon: '🗓️' },
]

export default function TarifasPage() {
  const [tarifas, setTarifas] = useState<Record<string, number>>({ DIARIA: 25, QUINCENAL: 20, MENSUAL: 15 })
  const [saving, setSaving]   = useState<string | null>(null)
  const [saved,  setSaved]    = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/tarifas').then(r => r.json()).then((data: Tarifa[]) => {
      const map: Record<string, number> = {}
      data.forEach(t => { map[t.tipo] = t.precioPorDia })
      if (Object.keys(map).length > 0) setTarifas(prev => ({ ...prev, ...map }))
    })
  }, [])

  async function saveTarifa(tipo: string) {
    setSaving(tipo)
    await fetch('/api/tarifas', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo, precioPorDia: tarifas[tipo] }),
    })
    setSaving(null)
    setSaved(tipo)
    setTimeout(() => setSaved(null), 2000)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Configuración de Tarifas</h1>
        <p className="text-gray-500 mt-1">Define el precio por día según el tipo de contratación.</p>
      </div>

      <div className="grid grid-cols-3 gap-5">
        {TIPOS.map(({ tipo, desc, icon }) => (
          <div key={tipo} className="card p-6 space-y-4 hover:shadow-md transition-shadow">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xl">{icon}</span>
                <p className="text-gray-900 font-bold text-base">{TARIFA_LABELS[tipo]}</p>
              </div>
              <p className="text-gray-500 text-xs">{desc}</p>
            </div>

            <div>
              <label className="label">Precio por día ($)</label>
              <div className="flex gap-2 items-center">
                <span className="text-gray-500 font-semibold text-lg">$</span>
                <input
                  type="number" step="0.01" min="0"
                  className="input"
                  value={tarifas[tipo] ?? ''}
                  onChange={e => setTarifas(prev => ({ ...prev, [tipo]: parseFloat(e.target.value) || 0 }))}
                />
              </div>
            </div>

            <div className="bg-gray-50 rounded-xl p-3 text-center border border-gray-100">
              <p className="text-gray-400 text-xs">Precio actual</p>
              <p className="text-3xl font-bold text-gray-900">{formatCurrency(tarifas[tipo] ?? 0)}</p>
              <p className="text-gray-400 text-xs">por día / por persona</p>
            </div>

            <button
              onClick={() => saveTarifa(tipo)}
              disabled={saving === tipo}
              className={saved === tipo ? 'btn-primary w-full text-sm bg-green-600 hover:bg-green-700' : 'btn-primary w-full text-sm'}
            >
              {saving === tipo ? 'Guardando...' : saved === tipo ? '✓ Guardado' : 'Guardar tarifa'}
            </button>
          </div>
        ))}
      </div>

      {/* Calculator table */}
      <div className="card p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Tabla de referencia rápida</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-500 border-b border-gray-100">
                <th className="text-left py-2 font-medium">Personas</th>
                {TIPOS.map(t => <th key={t.tipo} className="text-right py-2 font-medium">{TARIFA_LABELS[t.tipo]}/día</th>)}
              </tr>
            </thead>
            <tbody className="text-gray-700">
              {[1, 5, 10, 20, 50].map(n => (
                <tr key={n} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="py-2 font-semibold text-gray-900">{n} persona{n !== 1 ? 's' : ''}</td>
                  {TIPOS.map(t => (
                    <td key={t.tipo} className="text-right py-2">{formatCurrency((tarifas[t.tipo] ?? 0) * n)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

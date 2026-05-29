'use client'

import { useEffect, useState } from 'react'
import { TARIFA_LABELS, formatCurrency } from '@/lib/utils'

interface Tarifa { id: string; tipo: string; precioPorDia: number }

const TIPOS: Array<{ tipo: string; desc: string }> = [
  { tipo: 'DIARIA',    desc: 'Pago por cada día trabajado, sin compromiso de continuidad.' },
  { tipo: 'QUINCENAL', desc: 'Colaborador disponible durante una quincena de eventos.' },
  { tipo: 'MENSUAL',   desc: 'Colaborador disponible por un mes completo de eventos.' },
]

export default function TarifasPage() {
  const [tarifas, setTarifas] = useState<Record<string, number>>({ DIARIA: 25, QUINCENAL: 20, MENSUAL: 15 })
  const [saving, setSaving] = useState<string | null>(null)
  const [saved,  setSaved]  = useState<string | null>(null)

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
        <h1 className="text-2xl font-bold text-white">Configuración de Tarifas</h1>
        <p className="text-brand-400 mt-1">Define el precio por día según el tipo de contratación.</p>
      </div>

      <div className="grid grid-cols-3 gap-5">
        {TIPOS.map(({ tipo, desc }) => (
          <div key={tipo} className="card-gold p-6 space-y-4">
            <div>
              <p className="text-gold-400 font-semibold text-lg">{TARIFA_LABELS[tipo]}</p>
              <p className="text-brand-400 text-xs mt-1">{desc}</p>
            </div>

            <div>
              <label className="label">Precio por día ($)</label>
              <div className="flex gap-2">
                <span className="input flex items-center justify-center w-10 shrink-0 text-brand-300">$</span>
                <input
                  type="number" step="0.01" min="0"
                  className="input"
                  value={tarifas[tipo] ?? ''}
                  onChange={e => setTarifas(prev => ({ ...prev, [tipo]: parseFloat(e.target.value) || 0 }))}
                />
              </div>
            </div>

            <div className="bg-brand-900/40 rounded-xl p-3 text-center">
              <p className="text-brand-400 text-xs">Precio actual</p>
              <p className="text-2xl font-bold text-white">{formatCurrency(tarifas[tipo] ?? 0)}</p>
              <p className="text-brand-500 text-xs">por día</p>
            </div>

            <button
              onClick={() => saveTarifa(tipo)}
              disabled={saving === tipo}
              className="btn-primary w-full text-sm"
            >
              {saving === tipo ? 'Guardando...' : saved === tipo ? '✓ Guardado' : 'Guardar tarifa'}
            </button>
          </div>
        ))}
      </div>

      <div className="card p-5">
        <h3 className="text-sm font-semibold text-brand-300 mb-3">Ejemplo de cálculo</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-brand-400 border-b border-brand-800/50">
                <th className="text-left py-2">Personas</th>
                {TIPOS.map(t => <th key={t.tipo} className="text-right py-2">{TARIFA_LABELS[t.tipo]}/día</th>)}
              </tr>
            </thead>
            <tbody className="text-brand-200">
              {[1, 5, 10, 20, 50].map(n => (
                <tr key={n} className="border-b border-brand-900/50">
                  <td className="py-2 font-medium text-white">{n} persona{n !== 1 ? 's' : ''}</td>
                  {TIPOS.map(t => (
                    <td key={t.tipo} className="text-right py-2">
                      {formatCurrency((tarifas[t.tipo] ?? 0) * n)}
                    </td>
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

'use client'

import { useEffect, useState } from 'react'
import { TARIFA_LABELS, formatCurrency } from '@/lib/utils'

interface Tarifa { id: string; tipo: string; precioPorDia: number }

const TIPOS: Array<{ tipo: string; desc: string; icon: string }> = [
  { tipo: 'DIARIA',    desc: 'Pago por cada día trabajado, sin compromiso de continuidad.', icon: '📅' },
  { tipo: 'QUINCENAL', desc: 'Colaborador disponible durante una quincena de eventos.',      icon: '📆' },
  { tipo: 'MENSUAL',   desc: 'Colaborador disponible por un mes completo de eventos.',       icon: '🗓️' },
]

// Redondeo: ≤ .50 baja, > .50 sube
function redondear(n: number): number {
  const floor = Math.floor(n)
  const dec   = n - floor
  return dec <= 0.5 ? floor : Math.ceil(n)
}

function calcularPago(tarifaDia: number, horasTrabajadas: number, tarifaHora: number, horasBase: number, limiteDia: number): {
  pagoBase: number; horasExtra: number; pagoHorasExtra: number; totalSinRedondear: number; total: number
} {
  const pagoBase      = tarifaDia
  const horasExtra    = Math.max(0, horasTrabajadas - horasBase)
  const pagoHorasExtraRaw = horasExtra * tarifaHora
  const pagoHorasExtra    = Math.min(pagoHorasExtraRaw, limiteDia - pagoBase > 0 ? limiteDia - pagoBase : 0)
  const totalSinRedondear = pagoBase + pagoHorasExtra
  const total             = redondear(totalSinRedondear)
  return { pagoBase, horasExtra, pagoHorasExtra, totalSinRedondear, total }
}

export default function TarifasPage() {
  const [tarifas, setTarifas] = useState<Record<string, number>>({
    DIARIA: 25, QUINCENAL: 20, MENSUAL: 15,
  })
  const [horaExtra,  setHoraExtra]  = useState(3.11)
  const [horasBase,  setHorasBase]  = useState(8)
  const [limiteDia,  setLimiteDia]  = useState(50)
  const [saving,     setSaving]     = useState<string | null>(null)
  const [saved,      setSaved]      = useState<string | null>(null)
  const [savingHora, setSavingHora] = useState(false)
  const [savedHora,  setSavedHora]  = useState(false)

  // Calculador
  const [calcTipo,  setCalcTipo]  = useState('DIARIA')
  const [calcHoras, setCalcHoras] = useState(8)

  useEffect(() => {
    fetch('/api/tarifas').then(r => r.json()).then((data: Tarifa[]) => {
      const map: Record<string, number> = {}
      data.forEach(t => {
        if (t.tipo === 'HORA_EXTRA')  setHoraExtra(t.precioPorDia)
        else if (t.tipo === 'HORAS_BASE')  setHorasBase(t.precioPorDia)
        else if (t.tipo === 'LIMITE_DIA')  setLimiteDia(t.precioPorDia)
        else map[t.tipo] = t.precioPorDia
      })
      if (Object.keys(map).length > 0) setTarifas(prev => ({ ...prev, ...map }))
    })
  }, [])

  async function saveTarifa(tipo: string) {
    setSaving(tipo)
    await fetch('/api/tarifas', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo, precioPorDia: tarifas[tipo] }),
    })
    setSaving(null); setSaved(tipo)
    setTimeout(() => setSaved(null), 2000)
  }

  async function saveHoraExtra() {
    setSavingHora(true)
    await Promise.all([
      fetch('/api/tarifas', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tipo: 'HORA_EXTRA',  precioPorDia: horaExtra }) }),
      fetch('/api/tarifas', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tipo: 'HORAS_BASE',  precioPorDia: horasBase }) }),
      fetch('/api/tarifas', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tipo: 'LIMITE_DIA',  precioPorDia: limiteDia }) }),
    ])
    setSavingHora(false); setSavedHora(true)
    setTimeout(() => setSavedHora(false), 2000)
  }

  const calcResult = calcularPago(tarifas[calcTipo] ?? 0, calcHoras, horaExtra, horasBase, limiteDia)

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Configuración de Tarifas</h1>
        <p className="text-gray-500 mt-1">Define el precio por día y la tarifa de horas extra.</p>
      </div>

      {/* Tarifas por día */}
      <div>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Tarifas por día</h2>
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
                  <input type="number" step="0.01" min="0" className="input"
                    value={tarifas[tipo] ?? ''}
                    onChange={e => setTarifas(prev => ({ ...prev, [tipo]: parseFloat(e.target.value) || 0 }))} />
                </div>
              </div>
              <div className="bg-gray-50 rounded-xl p-3 text-center border border-gray-100">
                <p className="text-gray-400 text-xs">Precio actual</p>
                <p className="text-3xl font-bold text-gray-900">{formatCurrency(tarifas[tipo] ?? 0)}</p>
                <p className="text-gray-400 text-xs">por día / por persona</p>
              </div>
              <button onClick={() => saveTarifa(tipo)} disabled={saving === tipo}
                className={saved === tipo ? 'btn-primary w-full text-sm bg-green-600 hover:bg-green-700' : 'btn-primary w-full text-sm'}>
                {saving === tipo ? 'Guardando...' : saved === tipo ? '✓ Guardado' : 'Guardar tarifa'}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Configuración de horas extra */}
      <div className="card p-6 border-l-4 border-l-amber-400">
        <h2 className="font-bold text-gray-900 mb-1">⏱️ Configuración de Horas Extra</h2>
        <p className="text-gray-500 text-sm mb-5">
          Si un colaborador trabaja más de las horas base, se le paga una tarifa por hora extra hasta el límite diario.
          El total se redondea: ≤ $.50 baja al entero, &gt; $.50 sube al siguiente.
        </p>
        <div className="grid grid-cols-3 gap-5">
          <div>
            <label className="label">Tarifa por hora extra ($)</label>
            <div className="flex gap-2 items-center">
              <span className="text-gray-500 font-semibold">$</span>
              <input type="number" step="0.01" min="0" className="input"
                value={horaExtra} onChange={e => setHoraExtra(parseFloat(e.target.value) || 0)} />
            </div>
            <p className="text-gray-400 text-xs mt-1">Actualmente: {formatCurrency(horaExtra)}/hora</p>
          </div>
          <div>
            <label className="label">Horas base (jornada normal)</label>
            <input type="number" step="1" min="1" max="24" className="input"
              value={horasBase} onChange={e => setHorasBase(parseInt(e.target.value) || 8)} />
            <p className="text-gray-400 text-xs mt-1">Horas antes de cobrar extra</p>
          </div>
          <div>
            <label className="label">Límite máximo por día ($)</label>
            <div className="flex gap-2 items-center">
              <span className="text-gray-500 font-semibold">$</span>
              <input type="number" step="0.01" min="0" className="input"
                value={limiteDia} onChange={e => setLimiteDia(parseFloat(e.target.value) || 0)} />
            </div>
            <p className="text-gray-400 text-xs mt-1">Tope máximo diario total</p>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button onClick={saveHoraExtra} disabled={savingHora}
            className={savedHora ? 'btn-primary text-sm bg-green-600 hover:bg-green-700' : 'btn-primary text-sm'}>
            {savingHora ? 'Guardando...' : savedHora ? '✓ Guardado' : 'Guardar configuración de horas extra'}
          </button>
          <p className="text-gray-400 text-xs">Redondeo: ≤ $X.50 → baja · &gt; $X.50 → sube</p>
        </div>
      </div>

      {/* Calculador de pago */}
      <div className="card p-6">
        <h2 className="font-bold text-gray-900 mb-1">🧮 Calculador de Pago por Horas</h2>
        <p className="text-gray-500 text-sm mb-5">Simula el pago de un colaborador según las horas trabajadas.</p>
        <div className="grid grid-cols-2 gap-5 mb-5">
          <div>
            <label className="label">Tipo de tarifa</label>
            <div className="flex gap-2">
              {TIPOS.map(t => (
                <button key={t.tipo} type="button" onClick={() => setCalcTipo(t.tipo)}
                  className={`flex-1 py-2 rounded-xl border-2 text-xs font-medium transition-all ${
                    calcTipo === t.tipo ? 'border-gray-900 bg-gray-50 text-gray-900' : 'border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}>
                  {TARIFA_LABELS[t.tipo]}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="label">Horas trabajadas: <strong>{calcHoras}h</strong></label>
            <input type="range" min="1" max="16" step="0.5" className="w-full mt-2"
              value={calcHoras} onChange={e => setCalcHoras(parseFloat(e.target.value))} />
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>1h</span><span>8h (base)</span><span>16h</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-3">
          <div className="bg-gray-50 rounded-xl p-4 text-center">
            <p className="text-xs text-gray-400 mb-1">Pago base</p>
            <p className="text-xl font-bold text-gray-900">{formatCurrency(calcResult.pagoBase)}</p>
            <p className="text-xs text-gray-400">tarifa del día</p>
          </div>
          <div className={`rounded-xl p-4 text-center ${calcResult.horasExtra > 0 ? 'bg-amber-50' : 'bg-gray-50'}`}>
            <p className="text-xs text-gray-400 mb-1">Horas extra</p>
            <p className={`text-xl font-bold ${calcResult.horasExtra > 0 ? 'text-amber-600' : 'text-gray-400'}`}>
              {calcResult.horasExtra}h
            </p>
            <p className="text-xs text-gray-400">{formatCurrency(horaExtra)}/h × {calcResult.horasExtra}</p>
          </div>
          <div className={`rounded-xl p-4 text-center ${calcResult.horasExtra > 0 ? 'bg-amber-50' : 'bg-gray-50'}`}>
            <p className="text-xs text-gray-400 mb-1">Pago extra</p>
            <p className={`text-xl font-bold ${calcResult.horasExtra > 0 ? 'text-amber-600' : 'text-gray-400'}`}>
              {formatCurrency(calcResult.pagoHorasExtra)}
            </p>
            <p className="text-xs text-gray-400">límite: {formatCurrency(limiteDia)}</p>
          </div>
          <div className="bg-gray-900 rounded-xl p-4 text-center">
            <p className="text-xs text-gray-400 mb-1">Total a pagar</p>
            <p className="text-xl font-bold text-white">{formatCurrency(calcResult.total)}</p>
            <p className="text-xs text-gray-400">
              {calcResult.totalSinRedondear !== calcResult.total
                ? `(${formatCurrency(calcResult.totalSinRedondear)} → redondeado)`
                : 'sin redondeo'}
            </p>
          </div>
        </div>

        {calcResult.pagoHorasExtra >= (limiteDia - calcResult.pagoBase) && calcResult.horasExtra > 0 && (
          <div className="mt-3 bg-red-50 border border-red-200 rounded-xl px-4 py-2 text-sm text-red-600">
            ⚠️ Límite diario de {formatCurrency(limiteDia)} aplicado — se cortaron las horas extra.
          </div>
        )}
      </div>

      {/* Tabla referencia */}
      <div className="card p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Tabla de referencia por horas extra</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-500 border-b border-gray-100">
                <th className="text-left py-2 font-medium">Horas trabajadas</th>
                <th className="text-left py-2 font-medium">Horas extra</th>
                {TIPOS.map(t => <th key={t.tipo} className="text-right py-2 font-medium">{TARIFA_LABELS[t.tipo]}</th>)}
              </tr>
            </thead>
            <tbody className="text-gray-700">
              {[8, 9, 10, 11, 12, 14, 16].map(h => {
                const horasEx = Math.max(0, h - horasBase)
                return (
                  <tr key={h} className={`border-b border-gray-50 hover:bg-gray-50 ${h === horasBase ? 'font-semibold bg-blue-50' : ''}`}>
                    <td className="py-2 text-gray-900">{h}h {h === horasBase ? <span className="text-xs text-blue-500">(base)</span> : ''}</td>
                    <td className="py-2 text-amber-600">{horasEx > 0 ? `+${horasEx}h` : '—'}</td>
                    {TIPOS.map(t => {
                      const r = calcularPago(tarifas[t.tipo] ?? 0, h, horaExtra, horasBase, limiteDia)
                      return (
                        <td key={t.tipo} className="text-right py-2">
                          <span className="font-semibold">{formatCurrency(r.total)}</span>
                          {r.horasExtra > 0 && r.pagoHorasExtra > 0 && (
                            <span className="text-xs text-amber-500 ml-1">(+{formatCurrency(r.pagoHorasExtra)})</span>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

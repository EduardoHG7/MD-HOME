'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'

interface FilaPlanilla {
  id: string
  nombreCompleto: string
  cedula: string
  telefono: string
  banco: string | null
  tipoCuenta: string | null
  cuentaBancaria: string
  funcion: string
  tarifaTipo: string | null
  precioPorDia: number | null
  dias: number | null
  monto: number | null
}

interface PlanillaData {
  evento: { nombre: string; fechaInicio: string; fechaFin: string; venue: { nombre: string } | null }
  filas: FilaPlanilla[]
}

const money = (n: number) => `$${n.toFixed(2)}`

export default function PlanillaEventoPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [data,    setData]    = useState<PlanillaData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')

  useEffect(() => {
    fetch(`/api/eventos/${id}/planilla`)
      .then(r => r.json())
      .then(d => { if (d.error) setError(d.error); else setData(d); setLoading(false) })
      .catch(() => { setError('Error de conexión'); setLoading(false) })
  }, [id])

  if (loading) return <p className="text-gray-400 text-center py-10">Cargando planilla...</p>
  if (error || !data) return <p className="text-red-500 text-center py-10">{error || 'Error'}</p>

  const total = data.filas.reduce((s, f) => s + (f.monto ?? 0), 0)

  return (
    <div className="max-w-5xl mx-auto">
      {/* Barra de acciones (no se imprime) */}
      <div className="flex items-center justify-between mb-6 print:hidden">
        <button onClick={() => router.back()} className="text-sm text-gray-500 hover:text-gray-800">
          ← Volver
        </button>
        <button onClick={() => window.print()} className="btn-primary text-sm">🖨 Imprimir planilla</button>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-8 print:border-0 print:p-0 print:rounded-none">
        <div className="flex items-center justify-between mb-6">
          <img src="/logo.png" alt="Panatickets" className="h-14 object-contain" />
          <div className="text-right">
            <h1 className="text-lg font-bold text-gray-900 uppercase">Planilla de personal eventual</h1>
            <p className="text-sm text-gray-600">{data.evento.nombre}</p>
            <p className="text-xs text-gray-500">
              {new Date(data.evento.fechaInicio).toLocaleDateString('es-PA')} — {new Date(data.evento.fechaFin).toLocaleDateString('es-PA')}
              {data.evento.venue ? ` · ${data.evento.venue.nombre}` : ''}
            </p>
          </div>
        </div>

        {data.filas.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-8">Este evento no tiene eventuales asignados aún</p>
        ) : (
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-gray-100 text-gray-700">
                {['N°', 'Nombre completo', 'Cédula', 'Función', 'Banco', 'Cuenta', 'Tarifa/día', 'Días', 'Monto', 'Firma'].map(h => (
                  <th key={h} className="border border-gray-300 px-2 py-1.5 text-left font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.filas.map((f, i) => (
                <tr key={f.id}>
                  <td className="border border-gray-300 px-2 py-1.5">{i + 1}</td>
                  <td className="border border-gray-300 px-2 py-1.5 font-medium">{f.nombreCompleto}</td>
                  <td className="border border-gray-300 px-2 py-1.5">{f.cedula}</td>
                  <td className="border border-gray-300 px-2 py-1.5">{f.funcion}</td>
                  <td className="border border-gray-300 px-2 py-1.5">{f.banco ?? '—'}</td>
                  <td className="border border-gray-300 px-2 py-1.5">{f.cuentaBancaria}</td>
                  <td className="border border-gray-300 px-2 py-1.5">{f.precioPorDia !== null ? money(f.precioPorDia) : '—'}</td>
                  <td className="border border-gray-300 px-2 py-1.5">{f.dias ?? '—'}</td>
                  <td className="border border-gray-300 px-2 py-1.5 font-semibold">{f.monto !== null ? money(f.monto) : '—'}</td>
                  <td className="border border-gray-300 px-2 py-1.5 w-24"></td>
                </tr>
              ))}
              <tr>
                <td colSpan={8} className="border border-gray-300 px-2 py-2 text-right font-bold uppercase">Total</td>
                <td className="border border-gray-300 px-2 py-2 font-bold">{money(total)}</td>
                <td className="border border-gray-300"></td>
              </tr>
            </tbody>
          </table>
        )}

        <div className="grid grid-cols-2 gap-16 mt-16 text-center text-xs text-gray-700">
          <div>
            <div className="border-t border-gray-400 pt-2 font-semibold uppercase">Preparado por</div>
          </div>
          <div>
            <div className="border-t border-gray-400 pt-2 font-semibold uppercase">Aprobado por<br />Panatickets, S.A.</div>
          </div>
        </div>
      </div>
    </div>
  )
}

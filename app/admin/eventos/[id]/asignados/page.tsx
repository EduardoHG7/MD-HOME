'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'

interface DiaAsistencia { fecha: string; entrada: string | null; salida: string | null }
interface Fila {
  id: string; nombre: string; cedula: string; funcion: string; solicitante: string
  tarifaTipo: string | null; precioPorDia: number | null
  diasAsignados: number | null; diasEscaneados: number; dias: DiaAsistencia[]
  montoAsignado: number | null; montoEscaneado: number | null
}
interface Consolidado {
  evento: { id: string; nombre: string }
  filas: Fila[]
  totales: { eventuales: number; diasAsignados: number; diasEscaneados: number; montoAsignado: number; montoEscaneado: number }
}

const $ = (n: number | null) => (n === null ? '—' : n.toLocaleString('es-PA', { style: 'currency', currency: 'USD' }))

export default function AsignadosPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [data, setData]       = useState<Consolidado | null>(null)
  const [loading, setLoading] = useState(true)
  const [abierto, setAbierto] = useState<Set<string>>(new Set())
  const [fSolicito, setFSolicito] = useState('')
  const [fFuncion,  setFFuncion]  = useState('')

  const cargar = useCallback(async () => {
    const r = await fetch(`/api/eventos/${id}/asignados`).then(x => x.json())
    if (r && !r.error) setData(r)
    setLoading(false)
  }, [id])
  useEffect(() => { cargar() }, [cargar])

  const toggle = (fid: string) =>
    setAbierto(prev => { const n = new Set(prev); n.has(fid) ? n.delete(fid) : n.add(fid); return n })

  if (loading) return <p className="text-gray-400 text-center py-10">Cargando asignados...</p>
  if (!data)   return <p className="text-gray-400 text-center py-10">Evento no encontrado.</p>

  const { evento, filas } = data

  // Opciones de los filtros (a partir de todas las filas)
  const solicitantes = Array.from(new Set(filas.map(f => f.solicitante))).sort()
  const funciones    = Array.from(new Set(filas.map(f => f.funcion))).sort()

  // Filas filtradas y totales recalculados sobre lo filtrado
  const filasFiltradas = filas.filter(f =>
    (!fSolicito || f.solicitante === fSolicito) &&
    (!fFuncion  || f.funcion === fFuncion))
  const totales = filasFiltradas.reduce((t, f) => ({
    eventuales:     t.eventuales + 1,
    diasAsignados:  t.diasAsignados  + (f.diasAsignados ?? 0),
    diasEscaneados: t.diasEscaneados + f.diasEscaneados,
    montoAsignado:  t.montoAsignado  + (f.montoAsignado ?? 0),
    montoEscaneado: t.montoEscaneado + (f.montoEscaneado ?? 0),
  }), { eventuales: 0, diasAsignados: 0, diasEscaneados: 0, montoAsignado: 0, montoEscaneado: 0 })

  const excelUrl = `/api/eventos/${id}/asignados-excel` +
    (fSolicito || fFuncion
      ? `?${new URLSearchParams({ ...(fSolicito ? { solicito: fSolicito } : {}), ...(fFuncion ? { funcion: fFuncion } : {}) }).toString()}`
      : '')

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <button onClick={() => router.push('/admin/eventos')} className="text-sm text-gray-500 hover:text-gray-800">
            ← Volver a eventos
          </button>
          <h1 className="text-2xl font-bold text-gray-900 mt-2">👥 Asignados — consolidado</h1>
          <p className="text-gray-500 mt-1">{evento.nombre}</p>
        </div>
        <a href={excelUrl}
          className="text-xs px-3 py-2 rounded-xl border-2 border-green-200 bg-green-50 text-green-700 hover:border-green-400 font-semibold transition-all whitespace-nowrap">
          ⬇️ Excel
        </a>
      </div>

      {/* Filtros */}
      {filas.length > 0 && (
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="label">Solicitó</label>
            <select className="input" value={fSolicito} onChange={e => setFSolicito(e.target.value)}>
              <option value="">Todos</option>
              {solicitantes.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Función</label>
            <select className="input" value={fFuncion} onChange={e => setFFuncion(e.target.value)}>
              <option value="">Todas</option>
              {funciones.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          {(fSolicito || fFuncion) && (
            <button onClick={() => { setFSolicito(''); setFFuncion('') }}
              className="text-xs text-gray-500 hover:text-gray-800 underline pb-2">Limpiar filtros</button>
          )}
          <span className="text-xs text-gray-400 pb-2 ml-auto">{filasFiltradas.length} de {filas.length}</span>
        </div>
      )}

      {filasFiltradas.length === 0 ? (
        <div className="card p-8 text-center text-gray-400">
          {filas.length === 0 ? 'No hay eventuales asignados a este evento.' : 'Ningún asignado coincide con el filtro.'}
        </div>
      ) : (
        <div className="card p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 uppercase tracking-wide border-b border-gray-100">
                <th className="px-4 py-3">Aplicante</th>
                <th className="px-3 py-3">Función</th>
                <th className="px-3 py-3">Solicitó</th>
                <th className="px-3 py-3 text-center">Tarifa</th>
                <th className="px-3 py-3 text-center">Días asig.</th>
                <th className="px-3 py-3 text-center">Días escan.</th>
                <th className="px-3 py-3 text-center">Horas</th>
                <th className="px-3 py-3 text-right">Pago asig.</th>
                <th className="px-3 py-3 text-right">Pago escan.</th>
              </tr>
            </thead>
            <tbody>
              {filasFiltradas.map(f => {
                const incompleto = f.diasAsignados !== null && f.diasEscaneados < f.diasAsignados
                const est = abierto.has(f.id)
                return (
                  <FilaEventual key={f.id} f={f} incompleto={incompleto} abierto={est} onToggle={() => toggle(f.id)} />
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-200 font-bold text-gray-900 bg-gray-50">
                <td className="px-4 py-3" colSpan={4}>TOTAL · {totales.eventuales} eventuales</td>
                <td className="px-3 py-3 text-center">{totales.diasAsignados}</td>
                <td className="px-3 py-3 text-center">{totales.diasEscaneados}</td>
                <td className="px-3 py-3" />
                <td className="px-3 py-3 text-right">{$(totales.montoAsignado)}</td>
                <td className="px-3 py-3 text-right">{$(totales.montoEscaneado)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <div className="flex items-center gap-4 text-xs text-gray-400">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-amber-100 border border-amber-300" /> Escaneó menos días de los asignados</span>
        <span>Horas y días calculados en hora de Panamá.</span>
      </div>
    </div>
  )
}

function FilaEventual({ f, incompleto, abierto, onToggle }: {
  f: Fila; incompleto: boolean; abierto: boolean; onToggle: () => void
}) {
  return (
    <>
      <tr className="border-b border-gray-50 hover:bg-gray-50/60">
        <td className="px-4 py-3">
          <p className="font-medium text-gray-900">{f.nombre}</p>
          <p className="text-xs text-gray-400">{f.cedula}</p>
        </td>
        <td className="px-3 py-3 text-gray-600">{f.funcion}</td>
        <td className="px-3 py-3 text-gray-600">{f.solicitante}</td>
        <td className="px-3 py-3 text-center text-gray-600">
          {f.tarifaTipo ?? '—'}
          {f.precioPorDia !== null && <span className="block text-xs text-gray-400">{$(f.precioPorDia)}/día</span>}
        </td>
        <td className="px-3 py-3 text-center text-gray-700">{f.diasAsignados ?? '—'}</td>
        <td className={`px-3 py-3 text-center font-semibold ${incompleto ? 'bg-amber-50 text-amber-700' : 'text-gray-700'}`}>
          {f.diasEscaneados}
        </td>
        <td className="px-3 py-3 text-center">
          {f.dias.length > 0 ? (
            <button onClick={onToggle} className="text-xs text-blue-500 hover:underline">
              {abierto ? 'ocultar' : `ver (${f.dias.length})`}
            </button>
          ) : <span className="text-xs text-gray-300">—</span>}
        </td>
        <td className="px-3 py-3 text-right text-gray-700">{$(f.montoAsignado)}</td>
        <td className="px-3 py-3 text-right font-semibold text-gray-900">{$(f.montoEscaneado)}</td>
      </tr>
      {abierto && f.dias.length > 0 && (
        <tr className="bg-gray-50/70">
          <td colSpan={9} className="px-4 py-2">
            <div className="flex flex-wrap gap-2">
              {f.dias.map((d, i) => (
                <span key={i} className="text-xs bg-white border border-gray-200 rounded-lg px-2.5 py-1 text-gray-600">
                  <span className="font-medium text-gray-800">{d.fecha}</span> · {d.entrada ?? '—'} → {d.salida ?? '—'}
                </span>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

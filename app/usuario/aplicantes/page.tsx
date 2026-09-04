'use client'

import { useEffect, useState } from 'react'
import { useTenant } from '@/hooks/useTenant'
import { formatDate } from '@/lib/utils'
import { claveJornada } from '@/lib/jornada'

interface Registro  { tipo: string; timestamp: string }
interface Tarifa    { tipo: string; precioPorDia: number }
interface Solicitud { id: string; tarifa: Tarifa | null }
interface Asignacion {
  id: string; funcion: string; estado: string
  evento:    { nombre: string; fechaInicio: string }
  solicitud: Solicitud
  registros: Registro[]
}
interface Aplicante {
  id: string; nombreCompleto: string; cedula: string; telefono: string
  email: string; cuentaBancaria: string; banco: string | null; tipoCuenta: string | null
  createdAt: string; activo: boolean
  noApto: boolean; motivoNoApto: string | null
  fotoPersonal: string | null; fotoCedula: string | null; fotoConCedula: string | null
  asignaciones: Asignacion[]
}

function agruparRegistrosPorDia(registros: Registro[]) {
  const porJornada: Record<string, Registro[]> = {}
  for (const r of registros) {
    const k = claveJornada(new Date(r.timestamp))
    if (!porJornada[k]) porJornada[k] = []
    porJornada[k].push(r)
  }
  const dias: Record<string, { entrada?: Registro; salida?: Registro }> = {}
  for (const k of Object.keys(porJornada)) {
    const regs = porJornada[k].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    if (regs.length === 1) {
      dias[k] = regs[0].tipo === 'SALIDA' ? { salida: regs[0] } : { entrada: regs[0] }
    } else {
      dias[k] = { entrada: regs[0], salida: regs[regs.length - 1] }
    }
  }
  return Object.entries(dias).sort(([a], [b]) => a.localeCompare(b))
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-50 rounded-lg p-3">
      <p className="text-gray-400 text-xs mb-0.5">{label}</p>
      <p className="text-gray-900 text-sm font-medium break-all">{value}</p>
    </div>
  )
}

export default function AplicantesUsuarioPage() {
  const { activeTenant } = useTenant()
  const [aplicantes, setAplicantes] = useState<Aplicante[]>([])
  const [selected,   setSelected]   = useState<Aplicante | null>(null)
  const [search,     setSearch]     = useState('')
  const [filtro,     setFiltro]     = useState<'' | 'ACTIVOS' | 'NO_APTOS'>('')
  const [cargando,   setCargando]   = useState(true)

  useEffect(() => {
    fetch('/api/aplicantes').then(r => r.json()).then(d => setAplicantes(Array.isArray(d) ? d : [])).finally(() => setCargando(false))
  }, [])

  if (activeTenant && activeTenant.slug !== 'printmediapty') {
    return (
      <div className="card p-8 text-center">
        <p className="text-3xl mb-3">🔒</p>
        <p className="text-gray-700 font-semibold">Esta sección es exclusiva de Print Media PTY.</p>
      </div>
    )
  }

  const filtered = aplicantes.filter(a => {
    const matchSearch =
      a.nombreCompleto.toLowerCase().includes(search.toLowerCase()) ||
      a.cedula.includes(search) || a.email.toLowerCase().includes(search.toLowerCase())
    const matchFiltro =
      filtro === 'ACTIVOS'  ? (a.activo && !a.noApto) :
      filtro === 'NO_APTOS' ? a.noApto :
      true
    return matchSearch && matchFiltro
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Base de Aplicantes</h1>
        <p className="text-gray-500 mt-1">{aplicantes.length} aplicante(s) registrado(s)</p>
      </div>

      <div className="flex gap-3 flex-wrap items-center">
        <input className="input w-full max-w-sm" placeholder="Buscar por nombre, cédula o correo..."
          value={search} onChange={e => setSearch(e.target.value)} />
        <div className="flex gap-1.5">
          {([
            { value: '',         label: 'Todos' },
            { value: 'ACTIVOS',  label: '✅ Activos' },
            { value: 'NO_APTOS', label: '🚫 No aptos' },
          ] as const).map(op => (
            <button key={op.value} onClick={() => setFiltro(op.value)}
              className={`text-xs px-3 py-1.5 rounded-full border-2 font-medium transition-all ${
                filtro === op.value ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 text-gray-500 hover:border-gray-400'
              }`}>
              {op.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {selected && (
          <div className="lg:hidden">
            <button onClick={() => setSelected(null)}
              className="flex items-center gap-2 text-sm text-gray-600 font-medium px-3 py-2 rounded-xl border border-gray-200 hover:bg-gray-50 transition-all">
              ← Volver a la lista
            </button>
          </div>
        )}
        <div className={`lg:col-span-2 space-y-2 ${selected ? 'hidden lg:block' : ''}`}>
          {filtered.map(a => (
            <button key={a.id} onClick={() => setSelected(a)}
              className={`card w-full text-left p-4 hover:border-gray-400 hover:shadow-md transition-all ${selected?.id === a.id ? 'border-gray-400 shadow-md' : ''}`}>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-gray-900 flex items-center justify-center text-sm font-bold text-white shrink-0">
                  {a.nombreCompleto[0]}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="font-semibold text-gray-900 text-sm truncate">{a.nombreCompleto}</p>
                    {a.noApto && <span className="shrink-0 text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full font-medium">No apto</span>}
                  </div>
                  <p className="text-gray-500 text-xs truncate">{a.cedula}</p>
                  <p className="text-gray-400 text-xs">{a.asignaciones.length} evento(s)</p>
                </div>
              </div>
            </button>
          ))}
          {!cargando && filtered.length === 0 && <div className="card p-6 text-center text-gray-400">Sin resultados.</div>}
        </div>

        {selected && (
          <div className="lg:col-span-3 space-y-4">
            <div className="card p-5">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-14 h-14 rounded-full bg-gray-900 flex items-center justify-center text-2xl font-bold text-white">
                  {selected.nombreCompleto[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-bold text-gray-900">{selected.nombreCompleto}</h3>
                  <p className="text-gray-500 text-sm">Registrado: {formatDate(selected.createdAt)}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <Field label="Cédula"          value={selected.cedula} />
                <Field label="Teléfono"        value={selected.telefono} />
                <Field label="Correo"          value={selected.email} />
                <Field label="Cuenta Bancaria" value={selected.cuentaBancaria} />
                {selected.banco      && <Field label="Banco"         value={selected.banco} />}
                {selected.tipoCuenta && <Field label="Tipo de cuenta" value={selected.tipoCuenta} />}
              </div>

              {(selected.fotoPersonal || selected.fotoCedula || selected.fotoConCedula) && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Fotos de verificación</p>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { key: 'fotoPersonal',  label: 'Foto personal', url: selected.fotoPersonal },
                      { key: 'fotoCedula',    label: 'Cédula',        url: selected.fotoCedula },
                      { key: 'fotoConCedula', label: 'Con cédula',    url: selected.fotoConCedula },
                    ].map(({ key, label, url }) => (
                      <div key={key} className="flex flex-col items-center gap-1">
                        <p className="text-xs text-gray-400">{label}</p>
                        {url ? (
                          <a href={url} target="_blank" rel="noopener noreferrer"
                            className="block w-full aspect-square rounded-xl overflow-hidden border-2 border-gray-200 hover:border-gray-400 transition-all">
                            <img src={url} alt={label} className="w-full h-full object-cover" />
                          </a>
                        ) : (
                          <div className="w-full aspect-square rounded-xl border-2 border-dashed border-gray-200 flex items-center justify-center">
                            <span className="text-gray-300 text-xs">Sin foto</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {selected.noApto && (
              <div className="card p-4 border-l-4 border-l-red-400 bg-red-50">
                <p className="text-red-700 font-semibold text-sm">Persona no apta para laborar</p>
                {selected.motivoNoApto && <p className="text-red-600 text-xs mt-1 italic">"{selected.motivoNoApto}"</p>}
              </div>
            )}

            {selected.asignaciones.length > 0 && (
              <div className="card p-5">
                <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">Historial de Eventos</h4>
                <div className="space-y-4">
                  {selected.asignaciones.map(a => {
                    const diasReg = agruparRegistrosPorDia(a.registros)
                    return (
                      <div key={a.id} className="bg-gray-50 rounded-xl overflow-hidden">
                        <div className="flex justify-between items-start px-4 py-3">
                          <div>
                            <p className="text-gray-900 text-sm font-semibold">{a.evento.nombre}</p>
                            <p className="text-gray-500 text-xs">{a.funcion} · {formatDate(a.evento.fechaInicio)}</p>
                          </div>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${a.estado === 'ACTIVA' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                            {a.estado}
                          </span>
                        </div>
                        {diasReg.length === 0 ? (
                          <div className="px-4 py-2 border-t border-gray-200 bg-white">
                            <p className="text-gray-300 text-xs">Sin registros de asistencia</p>
                          </div>
                        ) : (
                          <table className="w-full text-xs border-t border-gray-200">
                            <thead>
                              <tr className="bg-white text-gray-400">
                                <th className="px-4 py-1.5 text-left">Fecha</th>
                                <th className="px-3 py-1.5 text-left">Entrada</th>
                                <th className="px-3 py-1.5 text-left">Salida</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {diasReg.map(([dia, rec]) => {
                                if (!rec.entrada && !rec.salida) return null
                                return (
                                  <tr key={dia} className="bg-white">
                                    <td className="px-4 py-2 text-gray-700 font-medium">{new Date(dia + 'T12:00:00').toLocaleDateString('es-PA', { day: '2-digit', month: 'short' })}</td>
                                    <td className="px-3 py-2 text-green-600">{rec.entrada ? new Date(rec.entrada.timestamp).toLocaleTimeString('es-PA', { hour: '2-digit', minute: '2-digit' }) : '-'}</td>
                                    <td className="px-3 py-2 text-blue-600">{rec.salida ? new Date(rec.salida.timestamp).toLocaleTimeString('es-PA', { hour: '2-digit', minute: '2-digit' }) : '-'}</td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

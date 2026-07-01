'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { formatDate, formatCurrency, TARIFA_LABELS, ESTADO_COLORS, ESTADO_SOLICITUD_LABELS } from '@/lib/utils'

interface Registro { tipo: string; timestamp: string }
interface Asignacion {
  id: string; funcion: string
  aplicante: { nombreCompleto: string; cedula: string; telefono: string }
  registros: Registro[]
}
interface Solicitud {
  id: string; numPersonas: number; funcion: string; estado: string
  costoTotal: number | null; notaAdmin: string | null; createdAt: string
  fechaInicioLabor: string | null; fechaFinLabor: string | null
  evento: { nombre: string; fechaInicio: string; fechaFin: string }
  tarifa: { tipo: string; precioPorDia: number } | null
  aprobadoPor: { name: string | null; email: string } | null
  asignaciones: Asignacion[]
}
interface CotFactura { id: string; descripcion: string; proveedor: string | null; monto: number }
interface Cotizacion {
  id: string; descripcion: string | null; estado: string; montoTotal: number
  notaAdmin: string | null; createdAt: string; concepto: string | null
  aprobadaPor: { name: string | null; email: string } | null
  facturas: CotFactura[]
  linea: { descripcion: string; categoria: { nombre: string; presupuesto: { evento: { nombre: string } } } }
}
interface CMFactura {
  id: string; descripcion: string | null; proveedor: string | null; total: number; archivoPath: string | null
}
interface CajaMenuda {
  id: string; descripcion: string; montoSolicitado: number; montoAprobado: number | null
  estado: string; notaAdmin: string | null; createdAt: string
  evento: { nombre: string }
  facturas: CMFactura[]
}
interface UserData {
  user:        { id: string; name: string | null; email: string; role: string; telefono: string | null; createdAt: string }
  solicitudes: Solicitud[]
  cotizaciones: Cotizacion[]
  cajasMenuda: CajaMenuda[]
}

const CM_LABELS: Record<string, string> = {
  PENDIENTE: 'Pendiente', APROBADA: 'Aprobada', RECHAZADA: 'Rechazada',
  RESPALDOS_ENTREGADOS: 'Respaldos entregados', PAGADA: 'Pagada',
}
const CM_COLORS: Record<string, string> = {
  PENDIENTE: 'bg-yellow-100 text-yellow-700', APROBADA: 'bg-green-100 text-green-700',
  RECHAZADA: 'bg-red-100 text-red-600', RESPALDOS_ENTREGADOS: 'bg-blue-100 text-blue-700',
  PAGADA: 'bg-purple-100 text-purple-700',
}
const COT_COLORS: Record<string, string> = {
  PENDIENTE: 'bg-yellow-100 text-yellow-700', APROBADA: 'bg-green-100 text-green-700',
  RECHAZADA: 'bg-red-100 text-red-600',
}

function agruparPorDia(registros: Registro[]) {
  const dias: Record<string, { entrada?: Registro; salida?: Registro }> = {}
  for (const r of registros) {
    const dia = new Date(r.timestamp).toLocaleDateString('es-PA', { day: '2-digit', month: 'short', year: 'numeric' })
    if (!dias[dia]) dias[dia] = {}
    if (r.tipo === 'ENTRADA' && !dias[dia].entrada) dias[dia].entrada = r
    if (r.tipo === 'SALIDA'  && !dias[dia].salida)  dias[dia].salida  = r
  }
  return Object.entries(dias)
}

export default function VistaUsuarioPage() {
  const params = useParams()
  const router = useRouter()
  const [data,     setData]     = useState<UserData | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [mainTab,  setMainTab]  = useState<'personal' | 'cotizaciones' | 'caja_menuda'>('personal')
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/usuarios/${params.id}/vista`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
  }, [params.id])

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-400">Cargando...</div>
  if (!data)   return <div className="card p-6 text-center text-red-500">No se pudo cargar el usuario.</div>

  const { user, solicitudes, cotizaciones, cajasMenuda } = data

  return (
    <div className="space-y-6">
      {/* Banner admin */}
      <div className="bg-gray-900 text-white rounded-2xl px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-lg">👁</span>
          <div>
            <p className="text-sm font-bold">Vista de usuario — Modo Admin</p>
            <p className="text-xs text-gray-300">Estás viendo el sistema como lo ve <strong>{user.name ?? user.email}</strong></p>
          </div>
        </div>
        <button onClick={() => router.push('/admin/usuarios')}
          className="text-xs px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 transition-all font-medium">
          ← Volver
        </button>
      </div>

      {/* Info usuario */}
      <div className="card p-5 flex flex-wrap items-center gap-4">
        <div className="w-12 h-12 rounded-full bg-gray-900 flex items-center justify-center text-xl font-bold text-white shrink-0">
          {(user.name ?? user.email)[0].toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-gray-900 text-lg">{user.name ?? '(sin nombre)'}</p>
          <p className="text-gray-500 text-sm">{user.email}</p>
          {user.telefono && <p className="text-gray-400 text-xs mt-0.5">{user.telefono}</p>}
        </div>
        <div className="flex gap-3 text-center">
          <Stat value={solicitudes.length}  label="Solicitudes"  />
          <Stat value={cotizaciones.length} label="Cotizaciones" />
          <Stat value={cajasMenuda.length}  label="Caja Menuda"  />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-2xl p-1 w-fit">
        {([
          { key: 'personal',      label: '👥 Personal',      count: solicitudes.filter(s => s.estado === 'PENDIENTE').length },
          { key: 'cotizaciones',  label: '📋 Cotizaciones',  count: cotizaciones.filter(c => c.estado === 'PENDIENTE').length },
          { key: 'caja_menuda',   label: '💰 Caja Menuda',   count: cajasMenuda.filter(c => c.estado === 'PENDIENTE').length },
        ] as const).map(t => (
          <button key={t.key} onClick={() => { setMainTab(t.key); setExpanded(null) }}
            className={`px-5 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-2 ${mainTab === t.key ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
            {t.label}
            {t.count > 0 && <span className="bg-amber-400 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">{t.count}</span>}
          </button>
        ))}
      </div>

      {/* ══ PERSONAL ══ */}
      {mainTab === 'personal' && (
        <div className="space-y-3">
          {solicitudes.length === 0
            ? <Empty icon="📋" msg="Sin solicitudes de personal" />
            : solicitudes.map(s => {
                const isExp = expanded === s.id
                const asigs = s.asignaciones ?? []
                return (
                  <div key={s.id} className="card overflow-hidden">
                    <button className="w-full text-left p-5 hover:bg-gray-50 transition-colors"
                      onClick={() => setExpanded(isExp ? null : s.id)}>
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-gray-900">{s.evento.nombre}</p>
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500 mt-1">
                            <span>👤 {s.numPersonas} persona(s)</span>
                            <span>🔧 {s.funcion}</span>
                            <span>📅 {formatDate(s.createdAt)}</span>
                          </div>
                          {s.estado === 'APROBADA' && (
                            <p className="text-xs text-gray-400 mt-1">Personal: {asigs.length}/{s.numPersonas}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`badge ${ESTADO_COLORS[s.estado]}`}>{ESTADO_SOLICITUD_LABELS[s.estado]}</span>
                          <span className="text-gray-400 text-sm">{isExp ? '▲' : '▼'}</span>
                        </div>
                      </div>
                    </button>

                    {isExp && (
                      <div className="border-t border-gray-100 bg-gray-50 p-5 space-y-4">
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <InfoBox label="Fechas del evento" value={`${formatDate(s.evento.fechaInicio)} – ${formatDate(s.evento.fechaFin)}`} />
                          {s.tarifa && <InfoBox label="Tarifa" value={`${TARIFA_LABELS[s.tarifa.tipo]} · ${formatCurrency(s.tarifa.precioPorDia)}/día`} />}
                          {s.costoTotal != null && <InfoBox label="Costo aprobado" value={formatCurrency(s.costoTotal)} highlight />}
                          {s.notaAdmin && <InfoBox label="Nota del admin" value={s.notaAdmin} cols2 />}
                          {s.aprobadoPor && <InfoBox label="Aprobado por" value={s.aprobadoPor.name ?? s.aprobadoPor.email} />}
                        </div>

                        {asigs.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Personal asignado</p>
                            <div className="space-y-2">
                              {asigs.map(a => {
                                const dias = agruparPorDia(a.registros ?? [])
                                return (
                                  <div key={a.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                                    <div className="px-4 py-3">
                                      <p className="font-medium text-gray-900 text-sm">{a.aplicante.nombreCompleto}</p>
                                      <p className="text-gray-400 text-xs">{a.aplicante.cedula} · {a.aplicante.telefono}</p>
                                    </div>
                                    {dias.length > 0 && (
                                      <div className="border-t border-gray-100 divide-y divide-gray-50">
                                        {dias.map(([dia, rec]) => (
                                          <div key={dia} className="flex items-center gap-3 px-4 py-1.5 bg-gray-50 text-xs">
                                            <span className="text-gray-500 font-semibold w-20 shrink-0">{dia}</span>
                                            <span className={rec.entrada ? 'text-green-600 font-medium' : 'text-gray-300'}>
                                              ↓ {rec.entrada ? new Date(rec.entrada.timestamp).toLocaleTimeString('es-PA',{hour:'2-digit',minute:'2-digit'}) : '—'}
                                            </span>
                                            <span className={rec.salida ? 'text-blue-600 font-medium' : 'text-gray-300'}>
                                              ↑ {rec.salida ? new Date(rec.salida.timestamp).toLocaleTimeString('es-PA',{hour:'2-digit',minute:'2-digit'}) : '—'}
                                            </span>
                                          </div>
                                        ))}
                                      </div>
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
                )
              })
          }
        </div>
      )}

      {/* ══ COTIZACIONES ══ */}
      {mainTab === 'cotizaciones' && (
        <div className="space-y-3">
          {cotizaciones.length === 0
            ? <Empty icon="📋" msg="Sin cotizaciones" />
            : cotizaciones.map(c => {
                const isExp = expanded === c.id
                return (
                  <div key={c.id} className="card overflow-hidden">
                    <button className="w-full text-left p-5 hover:bg-gray-50 transition-colors"
                      onClick={() => setExpanded(isExp ? null : c.id)}>
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-gray-900">{c.linea.categoria.presupuesto.evento.nombre}</p>
                          <p className="text-gray-500 text-sm mt-0.5">{c.linea.categoria.nombre} › {c.linea.descripcion}</p>
                          {c.concepto && <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">{c.concepto}</span>}
                          <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                            <span>{formatDate(c.createdAt)}</span>
                            <span className="font-semibold text-gray-700">{formatCurrency(c.montoTotal)}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`badge border ${COT_COLORS[c.estado]}`}>{c.estado}</span>
                          <span className="text-gray-400 text-sm">{isExp ? '▲' : '▼'}</span>
                        </div>
                      </div>
                    </button>

                    {isExp && (
                      <div className="border-t border-gray-100 bg-gray-50 p-5 space-y-3">
                        {c.descripcion && <p className="text-sm text-gray-600 italic bg-white rounded-xl px-4 py-3 border border-gray-100">{c.descripcion}</p>}
                        {c.notaAdmin && (
                          <div className="bg-white rounded-xl border border-gray-100 px-4 py-3">
                            <p className="text-xs text-gray-400 mb-0.5">Nota del admin</p>
                            <p className="text-sm text-gray-700 italic">"{c.notaAdmin}"</p>
                          </div>
                        )}
                        {c.aprobadaPor && (
                          <p className="text-xs text-gray-400">
                            {c.estado === 'APROBADA' ? 'Aprobada' : 'Revisada'} por: <strong>{c.aprobadaPor.name ?? c.aprobadaPor.email}</strong>
                          </p>
                        )}
                        {c.facturas.length > 0 && (
                          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                            <p className="px-4 pt-3 pb-1 text-xs font-semibold text-gray-500 uppercase tracking-wide">Desglose</p>
                            {c.facturas.map(f => (
                              <div key={f.id} className="flex justify-between px-4 py-2 text-sm border-t border-gray-50">
                                <span className="text-gray-700">{f.descripcion}{f.proveedor && <span className="text-gray-400 ml-1">({f.proveedor})</span>}</span>
                                <span className="font-semibold">{formatCurrency(f.monto)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })
          }
        </div>
      )}

      {/* ══ CAJA MENUDA ══ */}
      {mainTab === 'caja_menuda' && (
        <div className="space-y-3">
          {cajasMenuda.length === 0
            ? <Empty icon="💰" msg="Sin solicitudes de caja menuda" />
            : cajasMenuda.map(c => {
                const isExp = expanded === c.id
                const totalF = c.facturas.reduce((s, f) => s + f.total, 0)
                const diff   = (c.montoAprobado ?? 0) - totalF
                return (
                  <div key={c.id} className="card overflow-hidden">
                    <button className="w-full text-left p-5 hover:bg-gray-50 transition-colors"
                      onClick={() => setExpanded(isExp ? null : c.id)}>
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-gray-900">{c.evento.nombre}</p>
                          <p className="text-gray-500 text-sm mt-0.5 truncate">{c.descripcion}</p>
                          <div className="flex gap-4 mt-1 text-xs text-gray-400">
                            <span>Solicitado: <strong>${c.montoSolicitado.toFixed(2)}</strong></span>
                            {c.montoAprobado && <span className="text-green-600">Aprobado: <strong>${c.montoAprobado.toFixed(2)}</strong></span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`badge ${CM_COLORS[c.estado]}`}>{CM_LABELS[c.estado]}</span>
                          <span className="text-gray-400 text-sm">{isExp ? '▲' : '▼'}</span>
                        </div>
                      </div>
                    </button>

                    {isExp && (
                      <div className="border-t border-gray-100 bg-gray-50 p-5 space-y-3">
                        {c.notaAdmin && (
                          <div className="bg-white rounded-xl border border-gray-100 px-4 py-3">
                            <p className="text-xs text-gray-400 mb-0.5">Nota del admin</p>
                            <p className="text-sm text-gray-700 italic">"{c.notaAdmin}"</p>
                          </div>
                        )}
                        {c.facturas.length > 0 && (
                          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="bg-gray-50 text-gray-400 border-b border-gray-100">
                                  <th className="px-3 py-2 text-left">Descripción</th>
                                  <th className="px-3 py-2 text-left">Proveedor</th>
                                  <th className="px-3 py-2 text-right">Total</th>
                                  <th className="px-3 py-2 text-center">Doc</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-50">
                                {c.facturas.map(f => (
                                  <tr key={f.id}>
                                    <td className="px-3 py-2 text-gray-700">{f.descripcion ?? '—'}</td>
                                    <td className="px-3 py-2 text-gray-500">{f.proveedor ?? '—'}</td>
                                    <td className="px-3 py-2 text-right font-semibold">${f.total.toFixed(2)}</td>
                                    <td className="px-3 py-2 text-center">
                                      {f.archivoPath
                                        ? <a href={`/api/fotos?path=${encodeURIComponent(f.archivoPath)}`} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">Ver</a>
                                        : '—'}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                              <tfoot>
                                <tr className="bg-gray-50 font-semibold border-t border-gray-200 text-xs">
                                  <td className="px-3 py-2 text-gray-500" colSpan={2}>Total</td>
                                  <td className="px-3 py-2 text-right">${totalF.toFixed(2)}</td>
                                  <td></td>
                                </tr>
                              </tfoot>
                            </table>

                            {c.montoAprobado && c.facturas.length > 0 && (() => {
                              if (diff > 0.005) return (
                                <div className="mx-3 mb-3 mt-1 bg-green-50 border border-green-200 rounded-xl px-4 py-2 text-sm text-green-700 flex justify-between">
                                  <span>✅ Ahorro</span><span className="font-bold">${diff.toFixed(2)}</span>
                                </div>
                              )
                              if (diff < -0.005) return (
                                <div className="mx-3 mb-3 mt-1 bg-red-50 border border-red-200 rounded-xl px-4 py-2 text-sm text-red-700 flex justify-between">
                                  <span>❌ Excedido en</span><span className="font-bold">${Math.abs(diff).toFixed(2)}</span>
                                </div>
                              )
                              return (
                                <div className="mx-3 mb-3 mt-1 bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-2 text-sm text-yellow-700 text-center font-medium">
                                  🟡 Monto exacto
                                </div>
                              )
                            })()}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })
          }
        </div>
      )}
    </div>
  )
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="card px-4 py-3 text-center min-w-[70px]">
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-gray-400 text-xs mt-0.5">{label}</p>
    </div>
  )
}

function Empty({ icon, msg }: { icon: string; msg: string }) {
  return (
    <div className="card p-10 text-center">
      <p className="text-4xl mb-3">{icon}</p>
      <p className="text-gray-500 font-medium">{msg}</p>
    </div>
  )
}

function InfoBox({ label, value, highlight, cols2 }: { label: string; value: string; highlight?: boolean; cols2?: boolean }) {
  return (
    <div className={`bg-white rounded-xl p-3 border border-gray-100 ${cols2 ? 'col-span-2' : ''}`}>
      <p className="text-xs text-gray-400 mb-0.5">{label}</p>
      <p className={`text-sm font-medium ${highlight ? 'text-green-600 font-bold' : 'text-gray-900'}`}>{value}</p>
    </div>
  )
}

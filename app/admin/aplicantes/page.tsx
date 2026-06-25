'use client'

import { useEffect, useState } from 'react'
import { formatDate, formatDateTime } from '@/lib/utils'

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
  terminosAceptados: boolean; terminosAceptadosAt: string | null
  createdAt: string; activo: boolean
  noApto: boolean; motivoNoApto: string | null
  fotoPersonal: string | null; fotoCedula: string | null; fotoConCedula: string | null
  asignaciones: Asignacion[]
}
interface ConfigHoras { horaExtra: number; horasBase: number; limiteDia: number }

function redondear(n: number) {
  const floor = Math.floor(n)
  return (n - floor) <= 0.5 ? floor : Math.ceil(n)
}

function agruparRegistrosPorDia(registros: Registro[]) {
  const dias: Record<string, { entrada?: Registro; salida?: Registro }> = {}
  for (const r of registros) {
    const dia = new Date(r.timestamp).toISOString().slice(0, 10)
    if (!dias[dia]) dias[dia] = {}
    if (r.tipo === 'ENTRADA' && !dias[dia].entrada) dias[dia].entrada = r
    if (r.tipo === 'SALIDA'  && !dias[dia].salida)  dias[dia].salida  = r
  }
  return Object.entries(dias).sort(([a], [b]) => a.localeCompare(b))
}

function calcHorasDia(entrada: string, salida: string): number {
  return (new Date(salida).getTime() - new Date(entrada).getTime()) / (1000 * 60 * 60)
}

function calcPagoDia(tarifaDia: number, horas: number, cfg: ConfigHoras): {
  pagoBase: number; horasExtra: number; pagoExtra: number; total: number
} {
  const pagoBase   = tarifaDia
  const horasExtra = Math.max(0, horas - cfg.horasBase)
  const pagoExtraRaw = horasExtra * cfg.horaExtra
  const margen     = Math.max(0, cfg.limiteDia - pagoBase)
  const pagoExtra  = Math.min(pagoExtraRaw, margen)
  const total      = redondear(pagoBase + pagoExtra)
  return { pagoBase, horasExtra, pagoExtra, total }
}

export default function AplicantesAdminPage() {
  const [aplicantes,  setAplicantes]  = useState<Aplicante[]>([])
  const [selected,    setSelected]    = useState<Aplicante | null>(null)
  const [search,      setSearch]      = useState('')
  const [copied,      setCopied]      = useState(false)
  const [showBanForm, setShowBanForm] = useState(false)
  const [motivoBan,   setMotivoBan]   = useState('')
  const [savingBan,   setSavingBan]   = useState(false)
  const [cfg, setCfg] = useState<ConfigHoras>({ horaExtra: 3.11, horasBase: 8, limiteDia: 50 })
  const [showQR, setShowQR] = useState(false)
  const [tarifas, setTarifas] = useState<Tarifa[]>([])
  const [savingTarifa, setSavingTarifa] = useState<string | null>(null) // solicitudId

  useEffect(() => {
    fetch('/api/aplicantes').then(r => r.json()).then(setAplicantes)
    fetch('/api/tarifas').then(r => r.json()).then((data: Tarifa[]) => {
      setTarifas(data)
      const map: Record<string, number> = {}
      data.forEach(t => { map[t.tipo] = t.precioPorDia })
      setCfg({
        horaExtra: map['HORA_EXTRA'] ?? 3.11,
        horasBase: map['HORAS_BASE'] ?? 8,
        limiteDia: map['LIMITE_DIA'] ?? 50,
      })
    })
  }, [])

  async function asignarTarifa(solicitudId: string, tipoTarifa: string) {
    setSavingTarifa(solicitudId)
    const res = await fetch(`/api/solicitudes/${solicitudId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipoTarifa }),
    })
    if (res.ok) {
      const tarifa = tarifas.find(t => t.tipo === tipoTarifa) ?? null
      setAplicantes(prev => prev.map(a => ({
        ...a,
        asignaciones: a.asignaciones.map(asig =>
          asig.solicitud.id === solicitudId
            ? { ...asig, solicitud: { ...asig.solicitud, tarifa } }
            : asig
        ),
      })))
      if (selected) {
        setSelected(prev => prev ? {
          ...prev,
          asignaciones: prev.asignaciones.map(asig =>
            asig.solicitud.id === solicitudId
              ? { ...asig, solicitud: { ...asig.solicitud, tarifa } }
              : asig
          ),
        } : prev)
      }
    }
    setSavingTarifa(null)
  }

  async function toggleNoApto(aplicante: Aplicante, motivo?: string) {
    setSavingBan(true)
    const noApto = !aplicante.noApto
    const res = await fetch(`/api/aplicantes/${aplicante.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ noApto, motivoNoApto: noApto ? (motivo ?? '') : null }),
    })
    if (res.ok) {
      const updated = { ...aplicante, noApto, motivoNoApto: noApto ? (motivo ?? '') : null }
      setAplicantes(prev => prev.map(a => a.id === aplicante.id ? updated : a))
      setSelected(updated)
      setShowBanForm(false); setMotivoBan('')
    }
    setSavingBan(false)
  }

  function copyLink(id: string) {
    navigator.clipboard.writeText(`${window.location.origin}/aplicante/${id}`)
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }

  const filtered = aplicantes.filter(a =>
    a.nombreCompleto.toLowerCase().includes(search.toLowerCase()) ||
    a.cedula.includes(search) || a.email.toLowerCase().includes(search.toLowerCase())
  )

  const resumen = selected ? (() => {
    let totalDias = 0, totalHoras = 0, totalPago = 0
    for (const asig of selected.asignaciones) {
      const dias = agruparRegistrosPorDia(asig.registros)
      for (const [, rec] of dias) {
        if (!rec.entrada || !rec.salida) continue
        totalDias++
        const horas = calcHorasDia(rec.entrada.timestamp, rec.salida.timestamp)
        totalHoras += horas
        const tarifa = asig.solicitud?.tarifa?.precioPorDia ?? 0
        totalPago += calcPagoDia(tarifa, horas, cfg).total
      }
    }
    return { totalDias, totalHoras: Math.round(totalHoras * 10) / 10, totalPago }
  })() : null

  const registroUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/aplicante/registro`
    : '/aplicante/registro'

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Base de Aplicantes</h1>
          <p className="text-gray-500 mt-1">{aplicantes.length} aplicante(s) registrado(s)</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setShowQR(true)} className="text-sm flex items-center gap-1.5 px-3 py-2 rounded-xl border-2 border-gray-200 text-gray-700 font-medium hover:border-gray-400 transition-all">
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>
              <rect x="5" y="5" width="3" height="3" fill="currentColor" stroke="none"/><rect x="16" y="5" width="3" height="3" fill="currentColor" stroke="none"/><rect x="5" y="16" width="3" height="3" fill="currentColor" stroke="none"/>
              <path d="M14 14h3v3h-3z" fill="currentColor" stroke="none"/><path d="M17 17h3v3h-3z" fill="currentColor" stroke="none"/><path d="M14 20h3"/><path d="M20 14v3"/>
            </svg>
            Generar QR
          </button>
          <button onClick={() => exportCSV(aplicantes)} className="btn-gold text-sm">&#8595; Exportar CSV</button>
        </div>
      </div>

      {showQR && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowQR(false)}>
          <div className="bg-white rounded-2xl shadow-2xl p-8 flex flex-col items-center gap-5 max-w-xs w-full" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-gray-900">Registro de Aplicantes</h2>
            <p className="text-gray-500 text-sm text-center">Escanea para acceder al formulario de registro</p>
            <div className="border-4 border-gray-900 rounded-xl overflow-hidden">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=10&data=${encodeURIComponent(registroUrl)}`}
                alt="QR de registro de aplicantes"
                width={240}
                height={240}
              />
            </div>
            <p className="text-xs text-gray-400 text-center break-all">{registroUrl}</p>
            <div className="flex gap-2 w-full">
              <a
                href={`https://api.qrserver.com/v1/create-qr-code/?size=400x400&margin=20&data=${encodeURIComponent(registroUrl)}`}
                download="qr-registro-aplicantes.png"
                className="flex-1 px-4 py-2 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-700 transition-all text-center">
                &#8595; Descargar
              </a>
              <button onClick={() => setShowQR(false)} className="flex-1 px-4 py-2 rounded-xl border-2 border-gray-200 text-gray-600 text-sm font-medium hover:border-gray-400 transition-all">
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      <input className="input w-full max-w-sm" placeholder="Buscar por nombre, cedula o correo..."
        value={search} onChange={e => setSearch(e.target.value)} />

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* En móvil: si hay seleccionado, mostrar botón de vuelta y ocultar la lista */}
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
          {filtered.length === 0 && <div className="card p-6 text-center text-gray-400">Sin resultados.</div>}
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
                  {selected.terminosAceptadosAt && (
                    <p className="text-green-600 text-xs mt-0.5">T&amp;C aceptados: {formatDate(selected.terminosAceptadosAt)}</p>
                  )}
                </div>
                <div className="flex flex-col gap-2 shrink-0">
                  <button onClick={() => copyLink(selected.id)}
                    className={`text-xs px-3 py-1.5 rounded-xl border-2 font-medium transition-all ${copied ? 'border-green-400 bg-green-50 text-green-600' : 'border-gray-200 text-gray-600 hover:border-gray-400'}`}>
                    {copied ? 'Copiado!' : 'Copiar link'}
                  </button>
                  <a href={`/aplicante/${selected.id}`} target="_blank" rel="noopener noreferrer"
                    className="text-xs px-3 py-1.5 rounded-xl border-2 border-gray-200 text-gray-600 hover:border-gray-400 text-center transition-all">
                    Ver perfil
                  </a>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <Field label="Cedula"          value={selected.cedula} />
                <Field label="Telefono"        value={selected.telefono} />
                <Field label="Correo"          value={selected.email} />
                <Field label="Cuenta Bancaria" value={selected.cuentaBancaria} />
                {selected.banco     && <Field label="Banco"        value={selected.banco} />}
                {selected.tipoCuenta && <Field label="Tipo de cuenta" value={selected.tipoCuenta} />}
              </div>

              {/* Fotos de verificación */}
              {(selected.fotoPersonal || selected.fotoCedula || selected.fotoConCedula) && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Fotos de verificación</p>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { key: 'fotoPersonal',  label: 'Foto personal',  url: selected.fotoPersonal },
                      { key: 'fotoCedula',    label: 'Cédula',         url: selected.fotoCedula },
                      { key: 'fotoConCedula', label: 'Con cédula',     url: selected.fotoConCedula },
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

            {selected.noApto ? (
              <div className="card p-4 border-l-4 border-l-red-400 bg-red-50 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-red-700 font-semibold text-sm">Persona no apta para laborar</p>
                    {selected.motivoNoApto && <p className="text-red-600 text-xs mt-1 italic">"{selected.motivoNoApto}"</p>}
                  </div>
                  <button onClick={() => toggleNoApto(selected)} disabled={savingBan}
                    className="text-xs px-3 py-1.5 rounded-xl border-2 border-red-300 text-red-600 hover:bg-red-100 font-medium transition-all shrink-0 ml-3">
                    {savingBan ? '...' : 'Quitar restriccion'}
                  </button>
                </div>
              </div>
            ) : (
              <div>
                {!showBanForm ? (
                  <button onClick={() => setShowBanForm(true)}
                    className="w-full text-left px-4 py-3 rounded-xl border-2 border-dashed border-red-200 text-red-500 hover:border-red-400 hover:bg-red-50 text-sm font-medium transition-all">
                    Marcar como persona no apta
                  </button>
                ) : (
                  <div className="card p-4 border-l-4 border-l-red-300 space-y-3">
                    <p className="text-sm font-semibold text-gray-900">Marcar como no apto</p>
                    <textarea className="input resize-none h-20 text-sm" placeholder="Motivo o comentario (requerido)..."
                      value={motivoBan} onChange={e => setMotivoBan(e.target.value)} />
                    <div className="flex gap-2">
                      <button onClick={() => { setShowBanForm(false); setMotivoBan('') }} className="btn-ghost flex-1 text-sm">Cancelar</button>
                      <button onClick={() => toggleNoApto(selected, motivoBan)} disabled={savingBan || !motivoBan.trim()}
                        className="flex-1 px-4 py-2 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-40 transition-all">
                        {savingBan ? 'Guardando...' : 'Confirmar'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {resumen && (
              <div className="grid grid-cols-3 gap-3">
                <div className="card p-4 text-center border-l-4 border-l-gray-400">
                  <p className="text-2xl font-bold text-gray-900">{resumen.totalDias}</p>
                  <p className="text-gray-500 text-xs mt-1">Dias trabajados</p>
                </div>
                <div className="card p-4 text-center border-l-4 border-l-blue-400">
                  <p className="text-2xl font-bold text-blue-600">{resumen.totalHoras}h</p>
                  <p className="text-gray-500 text-xs mt-1">Horas totales</p>
                </div>
                <div className="card p-4 text-center border-l-4 border-l-green-400">
                  <p className="text-2xl font-bold text-green-600">${resumen.totalPago}</p>
                  <p className="text-gray-500 text-xs mt-1">Pago sugerido total</p>
                </div>
              </div>
            )}

            {selected.asignaciones.length > 0 && (
              <div className="card p-5">
                <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">Historial de Eventos</h4>
                <div className="space-y-4">
                  {selected.asignaciones.map(a => {
                    const diasReg = agruparRegistrosPorDia(a.registros)
                    const tarifa  = a.solicitud?.tarifa?.precioPorDia ?? 0
                    const pagosEvento = diasReg
                      .filter(([, rec]) => rec.entrada && rec.salida)
                      .map(([dia, rec]) => {
                        const horas = calcHorasDia(rec.entrada!.timestamp, rec.salida!.timestamp)
                        return { dia, horas, ...calcPagoDia(tarifa, horas, cfg) }
                      })
                    const totalEvento = pagosEvento.reduce((s, p) => s + p.total, 0)

                    return (
                      <div key={a.id} className="bg-gray-50 rounded-xl overflow-hidden">
                        <div className="flex justify-between items-start px-4 py-3">
                          <div>
                            <p className="text-gray-900 text-sm font-semibold">{a.evento.nombre}</p>
                            <p className="text-gray-500 text-xs">{a.funcion} - {formatDate(a.evento.fechaInicio)}</p>
                            {tarifa > 0
                              ? <p className="text-gray-400 text-xs mt-0.5">Tarifa: ${tarifa}/dia</p>
                              : (
                                <div className="flex items-center gap-1.5 mt-1">
                                  <select
                                    defaultValue=""
                                    disabled={savingTarifa === a.solicitud.id}
                                    onChange={e => e.target.value && asignarTarifa(a.solicitud.id, e.target.value)}
                                    className="text-xs border border-amber-300 rounded-lg px-2 py-0.5 bg-amber-50 text-amber-700 focus:outline-none focus:ring-1 focus:ring-amber-400">
                                    <option value="" disabled>Asignar tarifa...</option>
                                    {tarifas.filter(t => !['HORA_EXTRA','HORAS_BASE','LIMITE_DIA'].includes(t.tipo)).map(t => (
                                      <option key={t.tipo} value={t.tipo}>${t.precioPorDia}/día — {t.tipo}</option>
                                    ))}
                                  </select>
                                  {savingTarifa === a.solicitud.id && <span className="text-xs text-amber-500">...</span>}
                                </div>
                              )}
                          </div>
                          <div className="text-right">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${a.estado === 'ACTIVA' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                              {a.estado}
                            </span>
                            {totalEvento > 0 && (
                              <p className="text-green-600 font-bold text-sm mt-1">${totalEvento} sugerido</p>
                            )}
                          </div>
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
                                <th className="px-3 py-1.5 text-right">Horas</th>
                                <th className="px-3 py-1.5 text-right">H. Extra</th>
                                <th className="px-3 py-1.5 text-right">Pago dia</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {diasReg.map(([dia, rec]) => {
                                if (!rec.entrada && !rec.salida) return null
                                const horas = rec.entrada && rec.salida
                                  ? calcHorasDia(rec.entrada.timestamp, rec.salida.timestamp)
                                  : null
                                const pago = horas !== null && tarifa > 0
                                  ? calcPagoDia(tarifa, horas, cfg)
                                  : null
                                return (
                                  <tr key={dia} className={`bg-white hover:bg-gray-50 ${horas && horas > cfg.horasBase ? 'bg-amber-50' : ''}`}>
                                    <td className="px-4 py-2 text-gray-700 font-medium">{new Date(dia).toLocaleDateString('es-PA', { day:'2-digit', month:'short' })}</td>
                                    <td className="px-3 py-2 text-green-600">{rec.entrada ? new Date(rec.entrada.timestamp).toLocaleTimeString('es-PA',{hour:'2-digit',minute:'2-digit'}) : '-'}</td>
                                    <td className="px-3 py-2 text-blue-600">{rec.salida  ? new Date(rec.salida.timestamp).toLocaleTimeString('es-PA',{hour:'2-digit',minute:'2-digit'}) : '-'}</td>
                                    <td className="px-3 py-2 text-right font-medium">
                                      {horas !== null ? (
                                        <span className={horas > cfg.horasBase ? 'text-amber-600' : 'text-gray-700'}>
                                          {Math.round(horas * 10) / 10}h
                                        </span>
                                      ) : '-'}
                                    </td>
                                    <td className="px-3 py-2 text-right text-amber-600">
                                      {pago && pago.horasExtra > 0 ? `+${Math.round(pago.horasExtra * 10)/10}h` : '-'}
                                    </td>
                                    <td className="px-3 py-2 text-right font-bold">
                                      {pago ? (
                                        <span className="text-gray-900">
                                          ${pago.total}
                                          {pago.horasExtra > 0 && <span className="text-amber-500 font-normal ml-1">(+${Math.round(pago.pagoExtra * 100)/100})</span>}
                                        </span>
                                      ) : <span className="text-gray-300">-</span>}
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                            {pagosEvento.length > 0 && (
                              <tfoot>
                                <tr className="bg-gray-50 font-semibold text-xs">
                                  <td className="px-4 py-2 text-gray-500" colSpan={3}>Total evento</td>
                                  <td className="px-3 py-2 text-right">{Math.round(pagosEvento.reduce((s,p)=>s+p.horas,0)*10)/10}h</td>
                                  <td className="px-3 py-2 text-right text-amber-600">+{Math.round(pagosEvento.reduce((s,p)=>s+p.horasExtra,0)*10)/10}h</td>
                                  <td className="px-3 py-2 text-right text-green-600">${totalEvento}</td>
                                </tr>
                              </tfoot>
                            )}
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

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-50 rounded-lg p-3">
      <p className="text-gray-400 text-xs mb-0.5">{label}</p>
      <p className="text-gray-900 text-sm font-medium break-all">{value}</p>
    </div>
  )
}

function exportCSV(aplicantes: Aplicante[]) {
  const rows = [
    ['Nombre', 'Cedula', 'Telefono', 'Correo', 'Cuenta Bancaria', 'T&C Aceptados', 'Eventos', 'Fecha Registro'],
    ...aplicantes.map(a => [
      a.nombreCompleto, a.cedula, a.telefono, a.email, a.cuentaBancaria,
      a.terminosAceptados ? 'Si' : 'No',
      a.asignaciones.map(x => x.evento.nombre).join(' | '),
      a.createdAt,
    ]),
  ]
  const csv  = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = `magic-dreams-aplicantes-${new Date().toISOString().slice(0,10)}.csv`
  a.click(); URL.revokeObjectURL(url)
}
'use client'

import { useState, useEffect, useCallback } from 'react'
import { formatDate, formatCurrency, TARIFA_LABELS, ESTADO_COLORS, ESTADO_SOLICITUD_LABELS } from '@/lib/utils'

interface Evento   { id: string; nombre: string; fechaInicio: string; fechaFin: string }
interface Puesto   { id: string; nombre: string }
interface Tarifa   { id: string; tipo: string; precioPorDia: number }
interface Aplicante {
  id:             string
  nombreCompleto: string
  cedula:         string
  telefono:       string
  asignaciones?:  { id: string }[]
}
interface Asignacion {
  id:        string
  funcion:   string
  aplicante: { id: string; nombreCompleto: string; cedula: string; telefono: string }
}
interface Solicitud {
  id:          string
  numPersonas: number
  funcion:     string
  estado:      string
  costoTotal:  number | null
  notaAdmin:   string | null
  createdAt:   string
  evento:      Evento
  tarifa:      Tarifa | null
  asignaciones: Asignacion[]
}

export default function SolicitarPage() {
  const [eventos,     setEventos]     = useState<Evento[]>([])
  const [puestos,     setPuestos]     = useState<Puesto[]>([])
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([])
  const [showForm,    setShowForm]    = useState(false)
  const [loading,     setLoading]     = useState(false)
  const [success,     setSuccess]     = useState(false)
  const [error,       setError]       = useState('')

  // Estado para asignación de aplicantes
  const [expandedId,    setExpandedId]    = useState<string | null>(null)
  const [aplicantes,    setAplicantes]    = useState<Aplicante[]>([])
  const [busqueda,      setBusqueda]      = useState('')
  const [buscando,      setBuscando]      = useState(false)
  const [asignando,     setAsignando]     = useState<string | null>(null)

  const [form, setForm] = useState({ eventoId: '', numPersonas: 1, funcion: '', funcionCustom: '' })

  useEffect(() => {
    Promise.all([
      fetch('/api/eventos').then(r => r.json()),
      fetch('/api/puestos').then(r => r.json()),
      fetch('/api/solicitudes').then(r => r.json()),
    ]).then(([ev, pu, sol]) => {
      setEventos(Array.isArray(ev) ? ev : [])
      setPuestos(Array.isArray(pu) ? pu : [])
      setSolicitudes(Array.isArray(sol) ? sol : [])
    })
  }, [])

  // Buscar aplicantes disponibles
  const buscarAplicantes = useCallback(async (q: string, eventoId: string) => {
    setBuscando(true)
    const res = await fetch(`/api/aplicantes/disponibles?q=${encodeURIComponent(q)}&eventoId=${eventoId}`)
    const data = await res.json()
    setAplicantes(Array.isArray(data) ? data : [])
    setBuscando(false)
  }, [])

  useEffect(() => {
    if (!expandedId) return
    const sol = solicitudes.find(s => s.id === expandedId)
    if (!sol) return
    const timer = setTimeout(() => buscarAplicantes(busqueda, sol.evento.id), 300)
    return () => clearTimeout(timer)
  }, [busqueda, expandedId, solicitudes, buscarAplicantes])

  function toggleExpanded(id: string) {
    if (expandedId === id) {
      setExpandedId(null)
      setBusqueda('')
      setAplicantes([])
    } else {
      setExpandedId(id)
      setBusqueda('')
      const sol = solicitudes.find(s => s.id === id)
      if (sol) buscarAplicantes('', sol.evento.id)
    }
  }

  async function asignar(solicitud: Solicitud, aplicanteId: string) {
    setAsignando(aplicanteId)
    const res = await fetch('/api/asignaciones', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        aplicanteId,
        eventoId:   solicitud.evento.id,
        solicitudId: solicitud.id,
        funcion:    solicitud.funcion,
      }),
    })
    if (res.ok) {
      const nueva = await res.json()
      setSolicitudes(prev => prev.map(s => s.id === solicitud.id
        ? { ...s, asignaciones: [...s.asignaciones, nueva] }
        : s
      ))
      // Marcar como ya asignado en la lista
      setAplicantes(prev => prev.map(a =>
        a.id === aplicanteId ? { ...a, asignaciones: [{ id: nueva.id }] } : a
      ))
    }
    setAsignando(null)
  }

  async function desasignar(solicitudId: string, asignacionId: string) {
    const res = await fetch('/api/asignaciones', {
      method:  'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ asignacionId, solicitudId }),
    })
    if (res.ok) {
      setSolicitudes(prev => prev.map(s => s.id === solicitudId
        ? { ...s, asignaciones: s.asignaciones.filter(a => a.id !== asignacionId) }
        : s
      ))
      setAplicantes(prev => prev.map(a =>
        a.asignaciones?.some(as => as.id === asignacionId)
          ? { ...a, asignaciones: [] }
          : a
      ))
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!form.eventoId) { setError('Selecciona un evento.'); return }
    const funcion = form.funcion === 'OTRO' ? form.funcionCustom.trim() : form.funcion
    if (!funcion) { setError('Indica la función del personal.'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/solicitudes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventoId: form.eventoId, numPersonas: form.numPersonas, funcion }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Error al enviar.'); return }
      setSolicitudes(prev => [{ ...data, asignaciones: [] }, ...prev])
      setSuccess(true)
      setForm({ eventoId: '', numPersonas: 1, funcion: '', funcionCustom: '' })
      setShowForm(false)
      setTimeout(() => setSuccess(false), 4000)
    } catch { setError('Error de conexión.') }
    finally { setLoading(false) }
  }

  const pendientes = solicitudes.filter(s => s.estado === 'PENDIENTE').length
  const aprobadas  = solicitudes.filter(s => s.estado === 'APROBADA').length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Solicitudes de Personal</h1>
          <p className="text-gray-500 mt-1">Gestiona tus solicitudes y asigna personal aprobado</p>
        </div>
        <button onClick={() => { setShowForm(v => !v); setError('') }} className="btn-primary">
          {showForm ? '✕ Cancelar' : '+ Nueva Solicitud'}
        </button>
      </div>

      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 rounded-xl px-4 py-3 text-sm">
          ✓ Solicitud enviada. El administrador la revisará y asignará la tarifa.
        </div>
      )}

      {/* Formulario */}
      {showForm && (
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-5">Nueva Solicitud</h2>
          {error && <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl px-4 py-3 mb-4 text-sm">{error}</div>}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Evento *</label>
              <select className="input" value={form.eventoId} onChange={e => setForm(f => ({ ...f, eventoId: e.target.value }))} required>
                <option value="">Seleccionar evento...</option>
                {eventos.map(ev => <option key={ev.id} value={ev.id}>{ev.nombre} — {formatDate(ev.fechaInicio)}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Cantidad de personas *</label>
              <input type="number" min={1} max={500} className="input" value={form.numPersonas}
                onChange={e => setForm(f => ({ ...f, numPersonas: parseInt(e.target.value) || 1 }))} required />
            </div>
            <div>
              <label className="label">Función a desempeñar *</label>
              <select className="input" value={form.funcion} onChange={e => setForm(f => ({ ...f, funcion: e.target.value }))} required>
                <option value="">Seleccionar función...</option>
                {puestos.map(p => <option key={p.id} value={p.nombre}>{p.nombre}</option>)}
                <option value="OTRO">Otro (especificar)</option>
              </select>
              {form.funcion === 'OTRO' && (
                <input className="input mt-2" placeholder="Describe la función..."
                  value={form.funcionCustom} onChange={e => setForm(f => ({ ...f, funcionCustom: e.target.value }))} />
              )}
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700">
              💡 El administrador asignará la tarifa y el costo total al revisar tu solicitud.
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? 'Enviando...' : 'Enviar Solicitud'}
            </button>
          </form>
        </div>
      )}

      {/* Resumen */}
      {solicitudes.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <div className="card p-4 text-center">
            <p className="text-3xl font-bold text-gray-900">{solicitudes.length}</p>
            <p className="text-gray-500 text-sm mt-1">Total</p>
          </div>
          <div className="card p-4 text-center">
            <p className="text-3xl font-bold text-yellow-500">{pendientes}</p>
            <p className="text-gray-500 text-sm mt-1">Pendientes</p>
          </div>
          <div className="card p-4 text-center">
            <p className="text-3xl font-bold text-green-500">{aprobadas}</p>
            <p className="text-gray-500 text-sm mt-1">Aprobadas</p>
          </div>
        </div>
      )}

      {/* Lista de solicitudes */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Mis Solicitudes</h2>
        {solicitudes.length === 0 ? (
          <div className="card p-10 text-center">
            <p className="text-4xl mb-3">📋</p>
            <p className="text-gray-700 font-semibold">No tienes solicitudes aún</p>
            <p className="text-gray-400 text-sm mt-1">Haz click en &quot;+ Nueva Solicitud&quot; para comenzar</p>
          </div>
        ) : (
          <div className="space-y-3">
            {solicitudes.map(s => (
              <div key={s.id} className="card overflow-hidden">
                {/* Info principal */}
                <div className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 truncate">{s.evento.nombre}</p>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500 mt-1">
                        <span>👤 {s.numPersonas} persona(s)</span>
                        <span>🔧 {s.funcion}</span>
                        <span>📅 {formatDate(s.createdAt)}</span>
                      </div>
                      <p className="text-gray-400 text-xs mt-1">
                        {formatDate(s.evento.fechaInicio)} – {formatDate(s.evento.fechaFin)}
                      </p>
                    </div>
                    <span className={`badge shrink-0 ${ESTADO_COLORS[s.estado]}`}>
                      {ESTADO_SOLICITUD_LABELS[s.estado]}
                    </span>
                  </div>

                  {/* Detalles si aprobada */}
                  {s.estado === 'APROBADA' && (
                    <div className="mt-3 pt-3 border-t border-gray-100 flex flex-wrap gap-4">
                      {s.tarifa && (
                        <div>
                          <p className="text-xs text-gray-400">Tarifa</p>
                          <p className="text-sm font-semibold text-gray-700">{TARIFA_LABELS[s.tarifa.tipo]} · {formatCurrency(s.tarifa.precioPorDia)}/día</p>
                        </div>
                      )}
                      {s.costoTotal && (
                        <div>
                          <p className="text-xs text-gray-400">Costo aprobado</p>
                          <p className="text-sm font-bold text-green-600">{formatCurrency(s.costoTotal)}</p>
                        </div>
                      )}
                      <div>
                        <p className="text-xs text-gray-400">Personal asignado</p>
                        <p className="text-sm font-semibold text-gray-700">
                          {s.asignaciones.length} / {s.numPersonas}
                          {s.asignaciones.length >= s.numPersonas
                            ? <span className="text-green-600 ml-1">✓ Completo</span>
                            : <span className="text-amber-500 ml-1">({s.numPersonas - s.asignaciones.length} pendiente{s.numPersonas - s.asignaciones.length !== 1 ? 's' : ''})</span>
                          }
                        </p>
                      </div>
                    </div>
                  )}

                  {s.notaAdmin && (
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      <p className="text-xs text-gray-400 mb-1">Nota del admin</p>
                      <p className="text-sm text-gray-600 italic">&quot;{s.notaAdmin}&quot;</p>
                    </div>
                  )}

                  {/* Botón asignar (solo aprobadas) */}
                  {s.estado === 'APROBADA' && (
                    <button
                      onClick={() => toggleExpanded(s.id)}
                      className={`mt-4 w-full py-2 rounded-xl text-sm font-medium border-2 transition-all ${
                        expandedId === s.id
                          ? 'border-gray-900 bg-gray-900 text-white'
                          : 'border-gray-200 text-gray-700 hover:border-gray-400'
                      }`}
                    >
                      {expandedId === s.id ? '▲ Cerrar panel de asignación' : '👥 Asignar Personal'}
                    </button>
                  )}
                </div>

                {/* Panel de asignación */}
                {expandedId === s.id && (
                  <div className="border-t border-gray-100 bg-gray-50 p-5 space-y-4">
                    {/* Personas ya asignadas */}
                    {s.asignaciones.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Asignados</p>
                        <div className="space-y-2">
                          {s.asignaciones.map(a => (
                            <div key={a.id} className="flex items-center justify-between bg-white rounded-xl px-4 py-2.5 border border-gray-200">
                              <div>
                                <p className="font-medium text-gray-900 text-sm">{a.aplicante.nombreCompleto}</p>
                                <p className="text-gray-400 text-xs">Cédula: {a.aplicante.cedula} · Tel: {a.aplicante.telefono}</p>
                              </div>
                              <button
                                onClick={() => desasignar(s.id, a.id)}
                                className="text-red-400 hover:text-red-600 text-xs px-2 py-1 rounded-lg hover:bg-red-50 transition-all"
                              >
                                Remover
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Buscar y agregar */}
                    {s.asignaciones.length < s.numPersonas && (
                      <div>
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                          Agregar aplicante ({s.numPersonas - s.asignaciones.length} disponible{s.numPersonas - s.asignaciones.length !== 1 ? 's' : ''})
                        </p>
                        <input
                          className="input mb-3"
                          placeholder="Buscar por nombre o cédula..."
                          value={busqueda}
                          onChange={e => setBusqueda(e.target.value)}
                        />
                        {buscando ? (
                          <p className="text-gray-400 text-sm text-center py-3">Buscando...</p>
                        ) : aplicantes.length === 0 ? (
                          <p className="text-gray-400 text-sm text-center py-3">No se encontraron aplicantes disponibles</p>
                        ) : (
                          <div className="space-y-2 max-h-60 overflow-y-auto">
                            {aplicantes.map(a => {
                              const yaAsignado = a.asignaciones && a.asignaciones.length > 0
                              return (
                                <div key={a.id} className={`flex items-center justify-between bg-white rounded-xl px-4 py-2.5 border transition-all ${
                                  yaAsignado ? 'border-green-200 opacity-60' : 'border-gray-200'
                                }`}>
                                  <div>
                                    <p className="font-medium text-gray-900 text-sm">{a.nombreCompleto}</p>
                                    <p className="text-gray-400 text-xs">Cédula: {a.cedula} · Tel: {a.telefono}</p>
                                  </div>
                                  {yaAsignado ? (
                                    <span className="text-green-600 text-xs font-medium">✓ Asignado</span>
                                  ) : (
                                    <button
                                      onClick={() => asignar(s, a.id)}
                                      disabled={asignando === a.id}
                                      className="btn-primary text-xs py-1.5 px-3"
                                    >
                                      {asignando === a.id ? '...' : '+ Asignar'}
                                    </button>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )}

                    {s.asignaciones.length >= s.numPersonas && (
                      <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-700 text-center">
                        ✅ Ya tienes el personal completo para esta solicitud
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { formatDate, formatDateTime } from '@/lib/utils'

interface Registro { tipo: string; timestamp: string }
interface Asignacion {
  id: string
  funcion: string
  estado: string
  evento: { nombre: string; fechaInicio: string }
  registros: Registro[]
}
interface Aplicante {
  id: string
  nombreCompleto: string
  cedula: string
  telefono: string
  email: string
  cuentaBancaria: string
  terminosAceptados: boolean
  terminosAceptadosAt: string | null
  createdAt: string
  activo: boolean
  asignaciones: Asignacion[]
}

export default function AplicantesAdminPage() {
  const [aplicantes, setAplicantes] = useState<Aplicante[]>([])
  const [selected, setSelected] = useState<Aplicante | null>(null)
  const [search, setSearch] = useState('')
  const [copied, setCopied] = useState(false)

  function copyLink(id: string) {
    const url = `${window.location.origin}/aplicante/${id}`
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  useEffect(() => {
    fetch('/api/aplicantes').then(r => r.json()).then(setAplicantes)
  }, [])

  const filtered = aplicantes.filter(a =>
    a.nombreCompleto.toLowerCase().includes(search.toLowerCase()) ||
    a.cedula.includes(search) ||
    a.email.toLowerCase().includes(search.toLowerCase())
  )

  const totalDias = selected?.asignaciones.reduce((acc, a) => {
    return acc + Math.min(
      a.registros.filter(r => r.tipo === 'ENTRADA').length,
      a.registros.filter(r => r.tipo === 'SALIDA').length
    )
  }, 0) ?? 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Base de Aplicantes</h1>
          <p className="text-gray-500 mt-1">{aplicantes.length} aplicante(s) registrado(s)</p>
        </div>
        <button onClick={() => exportCSV(aplicantes)} className="btn-gold text-sm">
          ↓ Exportar CSV
        </button>
      </div>

      <input
        className="input max-w-sm"
        placeholder="Buscar por nombre, cédula o correo..."
        value={search}
        onChange={e => setSearch(e.target.value)}
      />

      <div className="grid grid-cols-5 gap-6">
        {/* List */}
        <div className="col-span-2 space-y-2">
          {filtered.map(a => (
            <button
              key={a.id}
              onClick={() => setSelected(a)}
              className={`card w-full text-left p-4 hover:border-gray-400 hover:shadow-md transition-all ${selected?.id === a.id ? 'border-gray-400 shadow-md' : ''}`}
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-gray-900 flex items-center justify-center text-sm font-bold text-white shrink-0">
                  {a.nombreCompleto[0]}
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900 text-sm truncate">{a.nombreCompleto}</p>
                  <p className="text-gray-500 text-xs truncate">{a.cedula}</p>
                  <p className="text-gray-400 text-xs">{a.asignaciones.length} evento(s)</p>
                </div>
              </div>
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="card p-6 text-center text-gray-400">Sin resultados.</div>
          )}
        </div>

        {/* Detail */}
        {selected && (
          <div className="col-span-3 space-y-4">
            {/* Profile */}
            <div className="card p-5">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-14 h-14 rounded-full bg-gray-900 flex items-center justify-center text-2xl font-bold text-white">
                  {selected.nombreCompleto[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-bold text-gray-900">{selected.nombreCompleto}</h3>
                  <p className="text-gray-500 text-sm">Registrado: {formatDate(selected.createdAt)}</p>
                  {selected.terminosAceptadosAt && (
                    <p className="text-green-600 text-xs mt-0.5">✓ T&C aceptados: {formatDate(selected.terminosAceptadosAt)}</p>
                  )}
                </div>
                <div className="flex flex-col gap-2 shrink-0">
                  <button
                    onClick={() => copyLink(selected.id)}
                    className={`text-xs px-3 py-1.5 rounded-xl border-2 font-medium transition-all ${
                      copied
                        ? 'border-green-400 bg-green-50 text-green-600'
                        : 'border-gray-200 text-gray-600 hover:border-gray-400'
                    }`}
                  >
                    {copied ? '✓ ¡Copiado!' : '🔗 Copiar link'}
                  </button>
                  <a
                    href={`/aplicante/${selected.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs px-3 py-1.5 rounded-xl border-2 border-gray-200 text-gray-600 hover:border-gray-400 text-center transition-all"
                  >
                    👁 Ver perfil
                  </a>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <Field label="Cédula"          value={selected.cedula} />
                <Field label="Teléfono"        value={selected.telefono} />
                <Field label="Correo"          value={selected.email} />
                <Field label="Cuenta Bancaria" value={selected.cuentaBancaria} />
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-3">
              <div className="card p-4 text-center border-l-4 border-l-gray-400">
                <p className="text-2xl font-bold text-gray-900">{selected.asignaciones.length}</p>
                <p className="text-gray-500 text-xs mt-1">Eventos participados</p>
              </div>
              <div className="card p-4 text-center border-l-4 border-l-green-400">
                <p className="text-2xl font-bold text-green-600">{totalDias}</p>
                <p className="text-gray-500 text-xs mt-1">Días con registro completo</p>
              </div>
            </div>

            {/* Event history */}
            {selected.asignaciones.length > 0 && (
              <div className="card p-5">
                <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">
                  Historial de Eventos
                </h4>
                <div className="space-y-3">
                  {selected.asignaciones.map(a => {
                    const entrada = a.registros.find(r => r.tipo === 'ENTRADA')
                    const salida  = a.registros.find(r => r.tipo === 'SALIDA')
                    return (
                      <div key={a.id} className="bg-gray-50 rounded-xl p-3">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="text-gray-900 text-sm font-medium">{a.evento.nombre}</p>
                            <p className="text-gray-500 text-xs">{a.funcion} · {formatDate(a.evento.fechaInicio)}</p>
                          </div>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            a.estado === 'ACTIVA'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-gray-100 text-gray-600'
                          }`}>{a.estado}</span>
                        </div>
                        {(entrada || salida) && (
                          <div className="flex gap-4 mt-2 pt-2 border-t border-gray-200">
                            {entrada && <span className="text-green-600 text-xs">↓ {formatDateTime(entrada.timestamp)}</span>}
                            {salida  && <span className="text-blue-600 text-xs">↑ {formatDateTime(salida.timestamp)}</span>}
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
    ['Nombre', 'Cédula', 'Teléfono', 'Correo', 'Cuenta Bancaria', 'T&C Aceptados', 'Eventos', 'Fecha Registro'],
    ...aplicantes.map(a => [
      a.nombreCompleto, a.cedula, a.telefono, a.email, a.cuentaBancaria,
      a.terminosAceptados ? 'Sí' : 'No',
      a.asignaciones.map(x => x.evento.nombre).join(' | '),
      a.createdAt,
    ]),
  ]
  const csv  = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = `magic-dreams-aplicantes-${new Date().toISOString().slice(0,10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

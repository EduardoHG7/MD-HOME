'use client'

import { Suspense, useEffect, useState, useCallback } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import Image from 'next/image'
import { formatDateTime } from '@/lib/utils'

interface Asignacion {
  id: string
  eventoId: string
  funcion: string
  estado: string
  evento: { nombre: string; fechaInicio: string; fechaFin: string }
  registros: Array<{ tipo: string; timestamp: string }>
}

interface Aplicante {
  id: string
  nombreCompleto: string
  email: string
  cedula: string
  asignaciones: Asignacion[]
}

// Componente interno que usa useSearchParams (debe estar dentro de Suspense)
function AplicanteContent() {
  const { id } = useParams<{ id: string }>()
  const searchParams  = useSearchParams()
  const eventoParam   = searchParams.get('evento')

  const [aplicante,      setAplicante]      = useState<Aplicante | null>(null)
  const [selectedEvento, setSelectedEvento] = useState<string | null>(null)
  const [loading,        setLoading]        = useState(true)
  const [selfTipo,       setSelfTipo]       = useState<'ENTRADA' | 'SALIDA' | null | undefined>(undefined)
  const [selfLoading,    setSelfLoading]    = useState(false)
  const [selfError,      setSelfError]      = useState('')

  useEffect(() => {
    fetch(`/api/aplicantes/${id}`)
      .then(r => r.json())
      .then(data => {
        setAplicante(data)
        if (eventoParam) {
          setSelectedEvento(eventoParam)
        } else {
          const active = data.asignaciones?.find((a: Asignacion) => a.estado === 'ACTIVA')
          if (active) setSelectedEvento(active.eventoId)
        }
        setLoading(false)
      })
  }, [id, eventoParam])

  const asignacionActiva = aplicante?.asignaciones.find(
    a => a.eventoId === selectedEvento && a.estado === 'ACTIVA'
  )

  const fetchSelfEstado = useCallback(async () => {
    if (!selectedEvento) return
    const res = await fetch(`/api/asistencia/self?eventoId=${selectedEvento}`)
    if (res.ok) {
      const data = await res.json()
      setSelfTipo(data.tipo)
    }
  }, [selectedEvento])

  useEffect(() => {
    fetchSelfEstado()
  }, [fetchSelfEstado])

  async function marcarAsistencia() {
    if (!selectedEvento) return
    setSelfLoading(true)
    setSelfError('')

    const coords = await new Promise<GeolocationPosition | null>(resolve => {
      if (!navigator.geolocation) return resolve(null)
      navigator.geolocation.getCurrentPosition(
        pos => resolve(pos),
        () => resolve(null),
        { timeout: 5000 }
      )
    })

    const res = await fetch('/api/asistencia/self', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventoId: selectedEvento,
        lat: coords?.coords.latitude,
        lng: coords?.coords.longitude,
      }),
    })
    const data = await res.json()

    if (!res.ok) {
      setSelfError(data.error || 'No se pudo registrar')
    } else {
      setSelfTipo(data.tipo === 'ENTRADA' ? 'SALIDA' : null)
      setAplicante(prev => prev && {
        ...prev,
        asignaciones: prev.asignaciones.map(a =>
          a.eventoId === selectedEvento
            ? { ...a, registros: [...a.registros, { tipo: data.tipo, timestamp: data.timestamp }] }
            : a
        ),
      })
    }
    setSelfLoading(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-400 animate-pulse text-sm">Cargando perfil...</div>
      </div>
    )
  }

  if (!aplicante || (aplicante as { error?: string }).error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="card p-8 text-center"><p className="text-red-600">Perfil no encontrado.</p></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8 max-w-lg mx-auto">
      {/* Header */}
      <div className="text-center mb-6">
        <Image src="/logo.png" alt="Magic Dreams Productions" width={160} height={80} className="mx-auto object-contain" priority />
      </div>

      {/* Profile Card */}
      <div className="card p-5 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-gray-900 flex items-center justify-center text-xl font-bold text-white">
            {aplicante.nombreCompleto[0]}
          </div>
          <div>
            <p className="font-semibold text-gray-900">{aplicante.nombreCompleto}</p>
            <p className="text-gray-500 text-sm">{aplicante.email}</p>
            <p className="text-gray-400 text-xs">Cédula: {aplicante.cedula}</p>
          </div>
        </div>
      </div>

      {/* Event selector */}
      {aplicante.asignaciones.length > 1 && (
        <div className="mb-4">
          <label className="label">Seleccionar evento</label>
          <select className="input" value={selectedEvento ?? ''}
            onChange={e => setSelectedEvento(e.target.value)}>
            {aplicante.asignaciones.map(a => (
              <option key={a.eventoId} value={a.eventoId}>{a.evento.nombre}</option>
            ))}
          </select>
        </div>
      )}

      {/* Autorregistro de entrada/salida */}
      {asignacionActiva ? (
        <div className="card border-2 p-6 mb-4 text-center">
          <p className="text-gray-900 font-bold text-sm mb-0.5 uppercase tracking-wider">
            {asignacionActiva.evento.nombre}
          </p>
          <p className="text-gray-500 text-xs mb-6">{asignacionActiva.funcion}</p>

          {selfError && (
            <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl px-4 py-3 mb-4 text-sm">
              {selfError}
            </div>
          )}

          {selfTipo === undefined ? (
            <div className="text-gray-400 animate-pulse text-sm py-6">Cargando estado...</div>
          ) : selfTipo === null ? (
            <div className="py-6">
              <p className="text-4xl mb-3">✅</p>
              <p className="text-gray-900 font-semibold">Turno completo</p>
              <p className="text-gray-500 text-sm mt-1">Ya registraste tu entrada y salida de hoy.</p>
            </div>
          ) : (
            <button
              onClick={marcarAsistencia}
              disabled={selfLoading}
              className={`w-full py-6 rounded-2xl text-white font-bold text-xl transition-colors ${
                selfTipo === 'ENTRADA' ? 'bg-green-600 hover:bg-green-700' : 'bg-blue-600 hover:bg-blue-700'
              } disabled:opacity-60`}
            >
              {selfLoading ? 'Registrando...' : selfTipo === 'ENTRADA' ? '↓ Marcar Entrada' : '↑ Marcar Salida'}
            </button>
          )}

          <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-3">
            <p className="text-amber-700 text-xs">
              Se guarda tu ubicación como respaldo.
            </p>
          </div>
        </div>
      ) : (
        <div className="card p-8 text-center mb-4">
          <p className="text-4xl mb-3">📅</p>
          <p className="text-gray-900 font-semibold">Sin asignación activa</p>
          <p className="text-gray-500 text-sm mt-1">
            Cuando seas asignado a un evento, podrás marcar tu entrada y salida aquí.
          </p>
        </div>
      )}

      {/* Historial */}
      {asignacionActiva && asignacionActiva.registros.length > 0 && (
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wider mb-3">
            Historial de hoy
          </h3>
          <div className="space-y-2">
            {asignacionActiva.registros.map((r, i) => (
              <div key={i} className="flex items-center justify-between py-1">
                <span className={`badge ${r.tipo === 'ENTRADA'
                  ? 'bg-green-50 text-green-700 border-green-200'
                  : 'bg-blue-50 text-blue-700 border-blue-200'}`}>
                  {r.tipo === 'ENTRADA' ? '↓ Entrada' : '↑ Salida'}
                </span>
                <span className="text-gray-600 text-sm font-medium">{formatDateTime(r.timestamp)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// Página exportada con Suspense boundary (requerido por useSearchParams en Next.js 14)
export default function AplicantePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-400 animate-pulse text-sm">Cargando...</div>
      </div>
    }>
      <AplicanteContent />
    </Suspense>
  )
}

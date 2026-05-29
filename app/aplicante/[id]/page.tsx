'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
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

export default function AplicantePage() {
  const { id } = useParams<{ id: string }>()
  const [aplicante, setAplicante] = useState<Aplicante | null>(null)
  const [selectedEvento, setSelectedEvento] = useState<string | null>(null)
  const [qrData, setQrData] = useState<{ qr: string; ttl: number } | null>(null)
  const [countdown, setCountdown] = useState(30)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/aplicantes/${id}`)
      .then(r => r.json())
      .then(data => {
        setAplicante(data)
        // Auto-select first active assignment
        const active = data.asignaciones?.find((a: Asignacion) => a.estado === 'ACTIVA')
        if (active) setSelectedEvento(active.eventoId)
        setLoading(false)
      })
  }, [id])

  const fetchQR = useCallback(async () => {
    if (!selectedEvento) return
    const res = await fetch(`/api/qr/token?aid=${id}&eid=${selectedEvento}`)
    if (res.ok) {
      const data = await res.json()
      setQrData(data)
      setCountdown(data.ttl)
    }
  }, [id, selectedEvento])

  // Fetch QR on mount and on every refresh
  useEffect(() => {
    if (!selectedEvento) return
    fetchQR()
  }, [selectedEvento, fetchQR])

  // Countdown and auto-refresh
  useEffect(() => {
    if (!qrData) return
    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          fetchQR()
          return 30
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [qrData, fetchQR])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-brand-400 animate-pulse">Cargando...</div>
      </div>
    )
  }

  if (!aplicante || (aplicante as { error?: string }).error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="card p-8 text-center">
          <p className="text-red-400">Perfil no encontrado.</p>
        </div>
      </div>
    )
  }

  const asignacionActiva = aplicante.asignaciones.find(
    a => a.eventoId === selectedEvento && a.estado === 'ACTIVA'
  )

  const urgentColor = countdown <= 5 ? 'text-red-400' : countdown <= 10 ? 'text-yellow-400' : 'text-green-400'

  return (
    <div className="min-h-screen px-4 py-8 max-w-lg mx-auto">
      {/* Header */}
      <div className="text-center mb-6">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-brand-800/60 border border-gold-500/40 mb-3">
          <span className="text-2xl">✨</span>
        </div>
        <h1 className="text-xl font-bold text-white">Magic Dreams Staff</h1>
      </div>

      {/* Profile Card */}
      <div className="card p-5 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-brand-700 flex items-center justify-center text-xl font-bold text-white">
            {aplicante.nombreCompleto[0]}
          </div>
          <div>
            <p className="font-semibold text-white">{aplicante.nombreCompleto}</p>
            <p className="text-brand-400 text-sm">{aplicante.email}</p>
            <p className="text-brand-500 text-xs">Cédula: {aplicante.cedula}</p>
          </div>
        </div>
      </div>

      {/* Event selector (if multiple) */}
      {aplicante.asignaciones.length > 1 && (
        <div className="mb-4">
          <label className="label">Seleccionar evento</label>
          <select
            className="input"
            value={selectedEvento ?? ''}
            onChange={e => setSelectedEvento(e.target.value)}
          >
            {aplicante.asignaciones.map(a => (
              <option key={a.eventoId} value={a.eventoId}>{a.evento.nombre}</option>
            ))}
          </select>
        </div>
      )}

      {/* QR Code */}
      {asignacionActiva ? (
        <div className="card-gold p-6 mb-4 text-center qr-pulse border-2">
          <p className="text-gold-400 font-semibold text-sm mb-1 uppercase tracking-wider">
            {asignacionActiva.evento.nombre}
          </p>
          <p className="text-brand-400 text-xs mb-4">{asignacionActiva.funcion}</p>

          {qrData ? (
            <div className="inline-block p-3 bg-white rounded-2xl shadow-2xl mb-4">
              <img src={qrData.qr} alt="Código QR de asistencia" width={260} height={260} />
            </div>
          ) : (
            <div className="w-[260px] h-[260px] bg-brand-900/60 rounded-2xl mx-auto mb-4 flex items-center justify-center">
              <div className="text-brand-400 animate-pulse text-sm">Generando QR...</div>
            </div>
          )}

          {/* Countdown */}
          <div className={`text-3xl font-bold mb-1 ${urgentColor}`}>
            {countdown}s
          </div>
          <p className="text-brand-400 text-xs">El código se renueva automáticamente</p>

          {/* Progress bar */}
          <div className="mt-3 h-1.5 bg-brand-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gold-500 rounded-full transition-all duration-1000"
              style={{ width: `${(countdown / 30) * 100}%` }}
            />
          </div>

          {/* Anti-fraud warning */}
          <div className="mt-4 bg-red-900/30 border border-red-700/40 rounded-xl p-3">
            <p className="text-red-400 text-xs font-semibold">⚠ CÓDIGO PERSONAL E INTRANSFERIBLE</p>
            <p className="text-red-400/70 text-xs mt-0.5">
              No compartas capturas de pantalla. El sistema detecta intentos de fraude.
            </p>
          </div>
        </div>
      ) : (
        <div className="card p-6 text-center mb-4">
          <p className="text-4xl mb-3">📅</p>
          <p className="text-white font-semibold">Sin asignación activa</p>
          <p className="text-brand-400 text-sm mt-1">
            Cuando seas asignado a un evento, tu código QR aparecerá aquí.
          </p>
        </div>
      )}

      {/* Attendance History */}
      {asignacionActiva && asignacionActiva.registros.length > 0 && (
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-brand-300 mb-3 uppercase tracking-wider">
            Historial de hoy
          </h3>
          <div className="space-y-2">
            {asignacionActiva.registros.map((r, i) => (
              <div key={i} className="flex items-center justify-between">
                <span className={`badge ${r.tipo === 'ENTRADA'
                  ? 'bg-green-500/20 text-green-400 border-green-500/30'
                  : 'bg-blue-500/20 text-blue-400 border-blue-500/30'}`}>
                  {r.tipo === 'ENTRADA' ? '↓ Entrada' : '↑ Salida'}
                </span>
                <span className="text-brand-300 text-sm">{formatDateTime(r.timestamp)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

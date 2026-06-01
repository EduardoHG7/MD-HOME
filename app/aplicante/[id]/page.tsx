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
  const [qrData,         setQrData]         = useState<{ qr: string; ttl: number } | null>(null)
  const [countdown,      setCountdown]      = useState(30)
  const [loading,        setLoading]        = useState(true)

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

  const fetchQR = useCallback(async () => {
    if (!selectedEvento) return
    const res = await fetch(`/api/qr/token?aid=${id}&eid=${selectedEvento}`)
    if (res.ok) {
      const data = await res.json()
      setQrData(data)
      setCountdown(data.ttl)
    }
  }, [id, selectedEvento])

  useEffect(() => {
    if (!selectedEvento) return
    fetchQR()
  }, [selectedEvento, fetchQR])

  useEffect(() => {
    if (!qrData) return
    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) { fetchQR(); return 30 }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [qrData, fetchQR])

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

  const asignacionActiva = aplicante.asignaciones.find(
    a => a.eventoId === selectedEvento && a.estado === 'ACTIVA'
  )

  const urgentColor = countdown <= 5 ? 'text-red-600' : countdown <= 10 ? 'text-amber-500' : 'text-green-600'
  const barColor    = countdown <= 5 ? 'bg-red-500'  : countdown <= 10 ? 'bg-amber-400'   : 'bg-green-500'

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

      {/* QR Code */}
      {asignacionActiva ? (
        <div className="card qr-pulse border-2 p-6 mb-4 text-center">
          <p className="text-gray-900 font-bold text-sm mb-0.5 uppercase tracking-wider">
            {asignacionActiva.evento.nombre}
          </p>
          <p className="text-gray-500 text-xs mb-4">{asignacionActiva.funcion}</p>

          {qrData ? (
            <div className="inline-block p-3 bg-white border-2 border-gray-100 rounded-2xl shadow-inner mb-4">
              <img src={qrData.qr} alt="Código QR de asistencia" width={260} height={260} />
            </div>
          ) : (
            <div className="w-[260px] h-[260px] bg-gray-100 rounded-2xl mx-auto mb-4 flex items-center justify-center">
              <div className="text-gray-400 animate-pulse text-sm">Generando QR...</div>
            </div>
          )}

          <div className={`text-4xl font-bold mb-1 ${urgentColor}`}>{countdown}s</div>
          <p className="text-gray-400 text-xs">El código se renueva automáticamente</p>

          <div className="mt-3 h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-1000 ${barColor}`}
              style={{ width: `${(countdown / 30) * 100}%` }}
            />
          </div>

          <div className="mt-4 bg-red-50 border border-red-200 rounded-xl p-3">
            <p className="text-red-600 text-xs font-bold">⚠ CÓDIGO PERSONAL E INTRANSFERIBLE</p>
            <p className="text-red-400 text-xs mt-0.5">
              No compartas capturas de pantalla. El sistema detecta intentos de fraude.
            </p>
          </div>
        </div>
      ) : (
        <div className="card p-8 text-center mb-4">
          <p className="text-4xl mb-3">📅</p>
          <p className="text-gray-900 font-semibold">Sin asignación activa</p>
          <p className="text-gray-500 text-sm mt-1">
            Cuando seas asignado a un evento, tu código QR aparecerá aquí.
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

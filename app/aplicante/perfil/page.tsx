'use client'

import { useEffect, useState } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { formatDate } from '@/lib/utils'

interface Asignacion {
  id:      string
  eventoId: string
  funcion: string
  estado:  string
  evento:  { nombre: string; fechaInicio: string; fechaFin: string }
}

interface Aplicante {
  id:             string
  nombreCompleto: string
  cedula:         string
  telefono:       string
  email:          string
  cuentaBancaria: string
  fotoPersonal:   string | null
  fotoCedula:     string | null
  fotoConCedula:  string | null
  asignaciones:   Asignacion[]
}

export default function AplicantePerfilPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [aplicante, setAplicante] = useState<Aplicante | null>(null)
  const [loading,   setLoading]   = useState(true)

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/aplicante/login')
      return
    }
    if (status === 'loading') return
    if (session?.user?.role !== 'APLICANTE') {
      router.push('/aplicante/login')
      return
    }

    fetch(`/api/aplicantes/${session.user.id}`)
      .then(r => r.json())
      .then(data => { setAplicante(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [session, status, router])

  if (loading || status === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-400 animate-pulse">Cargando perfil...</p>
      </div>
    )
  }

  if (!aplicante) return null

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8 max-w-lg mx-auto">
      {/* Header */}
      <div className="text-center mb-6">
        <Image src="/logo.png" alt="Magic Dreams Productions" width={140} height={70} className="mx-auto object-contain" priority />
      </div>

      {/* Perfil */}
      <div className="card p-5 mb-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            {aplicante.fotoPersonal ? (
              <img src={aplicante.fotoPersonal} alt="Foto" className="w-14 h-14 rounded-full object-cover border-2 border-gray-200" />
            ) : (
              <div className="w-14 h-14 rounded-full bg-gray-900 flex items-center justify-center text-2xl font-bold text-white">
                {aplicante.nombreCompleto[0]}
              </div>
            )}
            <div>
              <p className="font-bold text-gray-900">{aplicante.nombreCompleto}</p>
              <p className="text-gray-500 text-sm">{aplicante.email}</p>
              <p className="text-gray-400 text-xs">Cédula: {aplicante.cedula}</p>
            </div>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: '/aplicante/login' })}
            className="text-xs text-gray-400 hover:text-red-500 px-3 py-1.5 rounded-xl hover:bg-red-50 transition-all"
          >
            Salir
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="bg-gray-50 rounded-xl p-3">
            <p className="text-gray-400 text-xs mb-0.5">Teléfono</p>
            <p className="font-medium text-gray-900">{aplicante.telefono}</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-3">
            <p className="text-gray-400 text-xs mb-0.5">Cuenta IBAN</p>
            <p className="font-medium text-gray-900 text-xs break-all">{aplicante.cuentaBancaria}</p>
          </div>
        </div>
      </div>

      {/* Eventos asignados */}
      <div className="card p-5 mb-4">
        <h2 className="font-semibold text-gray-900 mb-3">Mis Eventos</h2>
        {aplicante.asignaciones.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-4xl mb-2">📅</p>
            <p className="text-gray-500 text-sm">Aún no tienes eventos asignados</p>
          </div>
        ) : (
          <div className="space-y-3">
            {aplicante.asignaciones.map(a => (
              <div key={a.id} className="bg-gray-50 rounded-xl p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-gray-900 text-sm">{a.evento.nombre}</p>
                    <p className="text-gray-500 text-xs mt-0.5">{a.funcion}</p>
                    <p className="text-gray-400 text-xs mt-0.5">
                      {formatDate(a.evento.fechaInicio)} – {formatDate(a.evento.fechaFin)}
                    </p>
                  </div>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    a.estado === 'ACTIVA' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                  }`}>{a.estado}</span>
                </div>
                {a.estado === 'ACTIVA' && (
                  <Link
                    href={`/aplicante/${aplicante.id}?evento=${a.eventoId}`}
                    className="mt-3 flex items-center justify-center gap-2 w-full py-2 rounded-xl bg-gray-900 text-white text-sm font-medium hover:bg-gray-700 transition-all"
                  >
                    📱 Ver mi QR de asistencia
                  </Link>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Documentos subidos */}
      {(aplicante.fotoPersonal || aplicante.fotoCedula || aplicante.fotoConCedula) && (
        <div className="card p-5">
          <h2 className="font-semibold text-gray-900 mb-3">Documentos subidos</h2>
          <div className="grid grid-cols-3 gap-3">
            {aplicante.fotoPersonal && (
              <a href={aplicante.fotoPersonal} target="_blank" rel="noopener noreferrer" className="block">
                <img src={aplicante.fotoPersonal} alt="Foto personal" className="w-full h-24 object-cover rounded-xl border border-gray-200" />
                <p className="text-xs text-center text-gray-400 mt-1">Mi foto</p>
              </a>
            )}
            {aplicante.fotoCedula && (
              <a href={aplicante.fotoCedula} target="_blank" rel="noopener noreferrer" className="block">
                <img src={aplicante.fotoCedula} alt="Foto cédula" className="w-full h-24 object-cover rounded-xl border border-gray-200" />
                <p className="text-xs text-center text-gray-400 mt-1">Mi cédula</p>
              </a>
            )}
            {aplicante.fotoConCedula && (
              <a href={aplicante.fotoConCedula} target="_blank" rel="noopener noreferrer" className="block">
                <img src={aplicante.fotoConCedula} alt="Foto con cédula" className="w-full h-24 object-cover rounded-xl border border-gray-200" />
                <p className="text-xs text-center text-gray-400 mt-1">Yo con cédula</p>
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

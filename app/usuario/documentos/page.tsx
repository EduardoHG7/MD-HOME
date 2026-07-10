'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { formatDate } from '@/lib/utils'
import { DocumentosEvento } from '@/components/DocumentosEvento'

interface EventoAsignado {
  id: string; nombre: string; fechaInicio: string; fechaFin: string; estado: string
  documentos: { id: string }[]
}

export default function DocumentosUsuarioPage() {
  const [eventos,     setEventos]     = useState<EventoAsignado[]>([])
  const [panatickets, setPanatickets] = useState(false)
  const [loading,     setLoading]     = useState(true)
  const [abierto,     setAbierto]     = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/mis-documentos')
      .then(r => r.json())
      .then(d => {
        if (d && Array.isArray(d.eventos)) {
          setEventos(d.eventos)
          setPanatickets(Boolean(d.panatickets))
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  if (loading) return <div className="text-gray-400 animate-pulse text-center py-16">Cargando...</div>

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Documentación de Eventos</h1>
        <p className="text-gray-500 mt-1">
          {panatickets
            ? 'Sube el aviso de operaciones, cédula, cierre, gastos, planilla y contrato de cada evento. El gerente general firma el contrato.'
            : 'Sube el contrato, seguro, fianza y demás documentos legales de los eventos que tienes asignados.'}
        </p>
      </div>

      {eventos.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-4xl mb-3">📁</p>
          <p className="text-gray-700 font-semibold">{panatickets ? 'No hay eventos' : 'No tienes eventos asignados'}</p>
          <p className="text-gray-400 text-sm mt-1">
            {panatickets
              ? 'Cuando se creen eventos de Panatickets aparecerán aquí.'
              : 'El administrador te asignará como responsable de documentación cuando corresponda.'}
          </p>
        </div>
      ) : panatickets ? (
        /* Panatickets: cada evento abre su expediente completo */
        <div className="space-y-4">
          {eventos.map(ev => (
            <Link key={ev.id} href={`/usuario/documentos/${ev.id}`}
              className="card p-5 flex items-center justify-between gap-3 hover:bg-gray-50 transition-colors block">
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900">{ev.nombre}</p>
                <p className="text-gray-400 text-xs mt-0.5">
                  📅 {formatDate(ev.fechaInicio)} – {formatDate(ev.fechaFin)}
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  ev.documentos.length > 0 ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                }`}>
                  {ev.documentos.length > 0 ? `${ev.documentos.length} documento(s)` : 'Sin documentos'}
                </span>
                <span className="text-gray-400 text-sm">→</span>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        /* Otras empresas: comportamiento clásico (solo responsable, tipos legales) */
        <div className="space-y-4">
          {eventos.map(ev => {
            const isOpen = abierto === ev.id
            return (
              <div key={ev.id} className="card overflow-hidden">
                <button
                  onClick={() => setAbierto(isOpen ? null : ev.id)}
                  className="w-full text-left p-5 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900">{ev.nombre}</p>
                      <p className="text-gray-400 text-xs mt-0.5">
                        📅 {formatDate(ev.fechaInicio)} – {formatDate(ev.fechaFin)}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        ev.documentos.length > 0 ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                      }`}>
                        {ev.documentos.length > 0 ? `${ev.documentos.length} documento(s)` : 'Sin documentos'}
                      </span>
                      <span className="text-gray-400 text-sm">{isOpen ? '▲' : '▼'}</span>
                    </div>
                  </div>
                </button>
                {isOpen && (
                  <div className="border-t border-gray-100 bg-gray-50 p-5">
                    <DocumentosEvento eventoId={ev.id} puedeSubir={true} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

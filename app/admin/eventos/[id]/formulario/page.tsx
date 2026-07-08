'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'

interface Formulario {
  razonSocial: string | null
  nombreComercial: string | null
  rucDv: string | null
  direccion: string | null
  provincia: string | null
  distrito: string | null
  corregimiento: string | null
  telefonos: string | null
  organizacion: string | null
  correoEnvio: string | null
}

function Campo({ label, valor, mayuscula = false }: { label: string; valor: string | null; mayuscula?: boolean }) {
  return (
    <div className="mb-3">
      <p className="text-[13px] font-bold text-gray-900 uppercase">{label}:</p>
      <p className={`text-[13px] text-gray-900 border-b border-gray-900 min-h-[20px] pb-0.5 ${mayuscula ? 'uppercase font-bold' : ''}`}>
        {valor ?? ''}
      </p>
    </div>
  )
}

export default function FormularioComprobantesPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [form,    setForm]    = useState<Formulario | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/eventos/${id}/formulario`)
      .then(r => r.json())
      .then(d => { setForm(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [id])

  if (loading) return <p className="text-gray-400 text-center py-10">Cargando formulario...</p>

  const esJuridica = form?.organizacion === 'JURIDICA'
  const esNatural  = form?.organizacion === 'NATURAL'

  return (
    <div className="max-w-2xl mx-auto">
      {/* Barra de acciones (no se imprime) */}
      <div className="flex items-center justify-between mb-6 print:hidden">
        <button onClick={() => router.back()} className="text-sm text-gray-500 hover:text-gray-800">
          ← Volver
        </button>
        <button onClick={() => window.print()} className="btn-primary text-sm">🖨 Imprimir para firma</button>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-10 print:border-0 print:p-0 print:rounded-none">
        <div className="flex justify-center mb-6">
          <img src="/logo.png" alt="Panatickets" className="h-16 object-contain" />
        </div>

        <h1 className="text-center font-bold text-gray-900 underline leading-snug mb-8">
          FORMULARIO<br />COMPROBANTES ELECTRÓNICOS
        </h1>

        <p className="text-[13px] font-bold text-gray-900 mb-5">DATOS FISCALES</p>

        <p className="text-[13px] font-bold text-gray-900 mb-3">1.&nbsp;&nbsp;DATOS GENERALES</p>

        <div className="pl-6">
          <Campo label="Razón social"       valor={form?.razonSocial ?? null} />
          <Campo label="Nombre comercial"   valor={form?.nombreComercial ?? null} />
          <Campo label="RUC y DV"           valor={form?.rucDv ?? null} />
          <Campo label="Dirección completa" valor={form?.direccion ?? null} />
          <Campo label="Provincia"          valor={form?.provincia ?? null} mayuscula />
          <Campo label="Distrito"           valor={form?.distrito ?? null} mayuscula />
          <Campo label="Corregimiento"      valor={form?.corregimiento ?? null} mayuscula />
          <Campo label="Teléfonos"          valor={form?.telefonos ?? null} />

          <div className="flex items-start gap-8 mt-6 text-[13px] text-gray-900">
            <p className="font-bold uppercase">Organización jurídica:</p>
            <p>Persona jurídica: <span className="inline-block w-10 border-b border-gray-900 text-center font-bold">{esJuridica ? 'X' : ''}</span></p>
            <p>Persona natural: <span className="inline-block w-10 border-b border-gray-900 text-center font-bold">{esNatural ? 'X' : ''}</span></p>
          </div>
        </div>

        <p className="text-[13px] font-bold text-gray-900 mt-8 mb-4 pl-3">2. DATOS CORREO DE ENVIO:</p>
        <div className="flex items-end gap-3 pl-6 text-[13px] text-gray-900">
          <p className="font-bold">Correo electrónico:</p>
          <p className="flex-1 border-b border-gray-900 min-h-[20px] pb-0.5">{form?.correoEnvio ?? ''}</p>
        </div>

        <p className="text-[13px] text-gray-900 text-center mt-14">
          Los datos proporcionados están correctos, validados y revisados por el cliente.
        </p>

        <div className="grid grid-cols-2 gap-16 mt-20 text-center text-[12px] font-bold text-gray-900 uppercase">
          <div className="border-t border-gray-900 pt-2">Firma de cliente</div>
          <div className="border-t border-gray-900 pt-2">Firma de validación<br />Panatickets, S.A.</div>
        </div>
      </div>
    </div>
  )
}

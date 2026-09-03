'use client'

import { useRef, useState } from 'react'
import Image from 'next/image'

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload  = () => resolve((reader.result as string).split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

async function archivoPayload(file: File | null) {
  if (!file) return null
  const base64 = await fileToBase64(file)
  return { base64, mimeType: file.type, fileName: file.name }
}

function CampoArchivo({ label, file, onChange }: {
  label: string
  file: File | null
  onChange: (f: File | null) => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <div>
      <label className="label">{label}</label>
      <div onClick={() => ref.current?.click()}
        className={`border-2 border-dashed rounded-xl p-3 cursor-pointer transition-all text-center ${
          file ? 'border-green-400 bg-green-50' : 'border-gray-300 hover:border-gray-400'
        }`}>
        {file ? (
          <div className="flex items-center justify-center gap-2 text-green-700 text-sm font-medium">
            <span>📎</span><span className="truncate">{file.name}</span>
            <button type="button" onClick={e => { e.stopPropagation(); onChange(null) }}
              className="text-red-400 hover:text-red-600 ml-1">✕</button>
          </div>
        ) : (
          <p className="text-gray-500 text-sm">📎 Adjuntar (PDF, Word o imagen)</p>
        )}
      </div>
      <input ref={ref} type="file" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) onChange(f); e.target.value = '' }} />
    </div>
  )
}

const FORM_VACIO = {
  nombreEmpresa: '', rucDv: '', nombreRepresentanteLegal: '', nombreContacto: '',
  telefono: '', correo: '', direccion: '', nombreBanco: '', tipoCuenta: '', numeroCuenta: '',
}

export default function RegistroProveedoresPage() {
  const [form, setForm] = useState(FORM_VACIO)
  const [aviso, setAviso] = useState<File | null>(null)
  const [cedula, setCedula] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [enviado, setEnviado] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/registro/proveedores', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          avisoOperaciones: await archivoPayload(aviso),
          cedulaRep: await archivoPayload(cedula),
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) { setError(data?.error ?? 'Error al enviar el registro.'); return }
      setEnviado(true)
    } catch {
      setError('Error de conexión.')
    } finally {
      setLoading(false)
    }
  }

  if (enviado) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="card p-10 max-w-md w-full text-center border-t-4 border-t-green-400">
          <div className="text-5xl mb-4">🎉</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">¡Registro enviado!</h2>
          <p className="text-gray-500">
            Gracias, hemos recibido los datos de <span className="font-semibold">{form.nombreEmpresa}</span>.
            El equipo de Print Media PTY se pondrá en contacto contigo.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <Image src="/logo_printmedia.png" alt="Print Media PTY" width={180} height={90} className="mx-auto object-contain" priority />
          <p className="text-gray-500 text-sm mt-2">Registro de Proveedores</p>
        </div>

        <div className="card p-8">
          {error && <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl px-4 py-3 mb-4 text-sm">{error}</div>}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Nombre de Empresa *</label>
              <input className="input" required value={form.nombreEmpresa}
                onChange={e => setForm({ ...form, nombreEmpresa: e.target.value })} />
            </div>
            <div>
              <label className="label">RUC/DV *</label>
              <input className="input" required value={form.rucDv}
                onChange={e => setForm({ ...form, rucDv: e.target.value })} />
            </div>
            <div>
              <label className="label">Nombre del Representante Legal *</label>
              <input className="input" required value={form.nombreRepresentanteLegal}
                onChange={e => setForm({ ...form, nombreRepresentanteLegal: e.target.value })} />
            </div>
            <div>
              <label className="label">Nombre de Contacto *</label>
              <input className="input" required value={form.nombreContacto}
                onChange={e => setForm({ ...form, nombreContacto: e.target.value })} />
            </div>
            <div>
              <label className="label">Teléfono *</label>
              <input className="input" required value={form.telefono}
                onChange={e => setForm({ ...form, telefono: e.target.value })} />
            </div>
            <div>
              <label className="label">Correo *</label>
              <input className="input" type="email" required value={form.correo}
                onChange={e => setForm({ ...form, correo: e.target.value })} />
            </div>
            <div>
              <label className="label">Dirección *</label>
              <input className="input" required value={form.direccion}
                onChange={e => setForm({ ...form, direccion: e.target.value })} />
            </div>
            <div className="border-t border-gray-100 pt-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Datos bancarios</p>
              <div className="space-y-4">
                <div>
                  <label className="label">Nombre de Banco *</label>
                  <input className="input" required value={form.nombreBanco}
                    onChange={e => setForm({ ...form, nombreBanco: e.target.value })} />
                </div>
                <div>
                  <label className="label">Tipo de Cuenta *</label>
                  <select className="input" required value={form.tipoCuenta}
                    onChange={e => setForm({ ...form, tipoCuenta: e.target.value })}>
                    <option value="">Selecciona el tipo de cuenta</option>
                    <option value="AHORRO">Cuenta de Ahorro</option>
                    <option value="CORRIENTE">Cuenta Corriente</option>
                  </select>
                </div>
                <div>
                  <label className="label">Número de Cuenta *</label>
                  <input className="input" required value={form.numeroCuenta}
                    onChange={e => setForm({ ...form, numeroCuenta: e.target.value })} />
                </div>
              </div>
            </div>
            <CampoArchivo label="📝 Aviso de Operaciones (opcional)" file={aviso} onChange={setAviso} />
            <CampoArchivo label="🪪 Cédula del Representante Legal (opcional)" file={cedula} onChange={setCedula} />
            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? 'Enviando...' : 'Enviar registro'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

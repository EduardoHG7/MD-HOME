'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { FirmaPad } from '@/components/FirmaPad'
import { FirmarContrato } from '@/components/FirmarContrato'
import type { EventoDoc } from '@/components/DocumentosEvento'

interface Contrato {
  id: string
  archivoPath: string
  archivoNombre: string
  firmadoPath: string | null
  estado: string
  firmadoAt: string | null
  createdAt: string
  subidoPor: { name: string | null; email: string }
  firmadoPor: { name: string | null; email: string } | null
}

interface Formulario {
  razonSocial: string
  nombreComercial: string
  rucDv: string
  direccion: string
  provincia: string
  distrito: string
  corregimiento: string
  telefonos: string
  organizacion: string
  correoEnvio: string
}

const FORM_VACIO: Formulario = {
  razonSocial: '', nombreComercial: '', rucDv: '', direccion: '', provincia: '',
  distrito: '', corregimiento: '', telefonos: '', organizacion: '', correoEnvio: '',
}

const SLOTS_SUBIDA = [
  { tipo: 'AVISO_OPERACIONES', icono: '🏛️', titulo: 'Aviso de operaciones',            nota: 'PDF o imagen — la IA lo usa para llenar el formulario' },
  { tipo: 'CEDULA_REP_LEGAL',  icono: '🪪', titulo: 'Cédula del representante legal',  nota: 'PDF o imagen — la IA lo usa para llenar el formulario' },
  { tipo: 'CIERRE',            icono: '🧾', titulo: 'Cierre',                          nota: 'Adjunta el cierre en imagen o PDF' },
  { tipo: 'GASTOS',            icono: '💸', titulo: 'Gastos',                          nota: 'Uber, aguas, transporte… puedes subir varios' },
  { tipo: 'PLANILLA',          icono: '👥', titulo: 'Planilla',                        nota: 'Se genera de los eventuales asignados; sube aquí la versión firmada' },
]

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload  = () => resolve((reader.result as string).split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

const verUrl = (path: string) => `/api/fotos?path=${encodeURIComponent(path)}`

export default function DocumentosEventoPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [evento,   setEvento]   = useState<{ nombre: string } | null>(null)
  const [docs,     setDocs]     = useState<EventoDoc[]>([])
  const [contrato, setContrato] = useState<Contrato | null>(null)
  const [form,     setForm]     = useState<Formulario>(FORM_VACIO)
  const [loading,  setLoading]  = useState(true)

  const cargar = useCallback(async () => {
    const [ev, ds, ct, fm] = await Promise.all([
      fetch(`/api/eventos/${id}`).then(r => r.json()),
      fetch(`/api/eventos/${id}/documentos`).then(r => r.json()),
      fetch(`/api/eventos/${id}/contrato`).then(r => r.json()),
      fetch(`/api/eventos/${id}/formulario`).then(r => r.json()),
    ])
    if (ev && !ev.error) setEvento(ev)
    if (Array.isArray(ds)) setDocs(ds)
    setContrato(ct && !ct.error ? ct : null)
    if (fm && !fm.error) {
      setForm(prev => ({
        ...prev,
        ...Object.fromEntries(Object.entries(fm).filter(([k, v]) => k in FORM_VACIO && v != null)),
      }))
    }
    setLoading(false)
  }, [id])

  useEffect(() => { cargar() }, [cargar])

  const tiene = (tipo: string) => docs.some(d => d.tipo === tipo)
  const checklist = [
    { label: 'Aviso de operaciones', ok: tiene('AVISO_OPERACIONES') },
    { label: 'Cédula rep. legal',    ok: tiene('CEDULA_REP_LEGAL') },
    { label: 'Formulario',           ok: Boolean(form.razonSocial && form.rucDv) },
    { label: 'Cierre',               ok: tiene('CIERRE') },
    { label: 'Gastos',               ok: tiene('GASTOS') },
    { label: 'Planilla',             ok: tiene('PLANILLA') },
    { label: 'Contrato firmado',     ok: contrato?.estado === 'FIRMADO' },
  ]
  const completados = checklist.filter(c => c.ok).length

  if (loading) return <p className="text-gray-400 text-center py-10">Cargando documentos...</p>

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <button onClick={() => router.push('/admin/eventos')} className="text-sm text-gray-500 hover:text-gray-800">
          ← Volver a eventos
        </button>
        <h1 className="text-2xl font-bold text-gray-900 mt-2">📁 Documentos del evento</h1>
        <p className="text-gray-500 mt-1">{evento?.nombre ?? '...'}</p>
      </div>

      {/* Checklist */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Checklist</p>
          <span className={`text-xs font-bold px-3 py-1 rounded-full ${
            completados === checklist.length ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
          }`}>
            {completados}/{checklist.length} completados
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {checklist.map(c => (
            <span key={c.label} className={`text-xs px-3 py-1.5 rounded-full border font-medium ${
              c.ok ? 'bg-green-50 border-green-200 text-green-700' : 'bg-gray-50 border-gray-200 text-gray-400'
            }`}>
              {c.ok ? '✓' : '○'} {c.label}
            </span>
          ))}
        </div>
      </div>

      <SeccionContrato eventoId={id} contrato={contrato} onChange={setContrato} />

      {/* Documentos por slot */}
      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Documentos</h2>
        {SLOTS_SUBIDA.map(slot => (
          <SlotDocumento key={slot.tipo} eventoId={id} slot={slot}
            docs={docs.filter(d => d.tipo === slot.tipo)}
            onSubido={doc => setDocs(prev => [doc, ...prev])}
            onEliminado={docId => setDocs(prev => prev.filter(d => d.id !== docId))}
            extra={slot.tipo === 'PLANILLA' ? (
              <Link href={`/admin/eventos/${id}/planilla`}
                className="text-xs px-3 py-1.5 rounded-xl border-2 border-gray-200 text-gray-600 hover:border-gray-400 font-medium transition-all whitespace-nowrap">
                📄 Generar de asignados
              </Link>
            ) : null}
          />
        ))}
      </div>

      <SeccionFormulario eventoId={id} form={form} setForm={setForm} />
    </div>
  )
}

/* ------------------------------ Contrato ------------------------------ */

function SeccionContrato({ eventoId, contrato, onChange }: {
  eventoId: string
  contrato: Contrato | null
  onChange: (c: Contrato | null) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [subiendo,     setSubiendo]     = useState(false)
  const [mostrarFirma, setMostrarFirma] = useState(false)
  const [verFirma,     setVerFirma]     = useState(false)
  const [error,        setError]        = useState('')

  async function subir(file: File) {
    if (file.type !== 'application/pdf') { setError('El contrato debe ser un PDF'); return }
    setSubiendo(true); setError('')
    try {
      const base64 = await fileToBase64(file)
      const res  = await fetch(`/api/eventos/${eventoId}/contrato`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64, fileName: file.name }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Error al subir'); return }
      onChange(data)
    } catch {
      setError('Error de conexión')
    } finally { setSubiendo(false) }
  }

  const firmado = contrato?.estado === 'FIRMADO'

  return (
    <div className={`card p-5 border-2 ${firmado ? 'border-green-200' : contrato ? 'border-amber-200' : 'border-gray-200'}`}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide">📝 Contrato del evento</p>
        {contrato && (
          <span className={`text-xs font-bold px-3 py-1 rounded-full ${
            firmado ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
          }`}>
            {firmado ? '✅ Firmado' : '⏳ Pendiente de firma'}
          </span>
        )}
      </div>

      {!contrato ? (
        <div>
          <p className="text-sm text-gray-500 mb-3">
            Sube el contrato del evento (PDF). Se notificará al administrador para que lo firme y,
            una vez firmado, se avisa a operaciones y contabilidad.
          </p>
          <button onClick={() => fileRef.current?.click()} disabled={subiendo} className="btn-primary text-sm">
            {subiendo ? '📤 Subiendo...' : '📤 Subir contrato (PDF)'}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-3">
            <span className="text-lg">📄</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{contrato.archivoNombre}</p>
              <p className="text-xs text-gray-400">
                Subido por {contrato.subidoPor.name ?? contrato.subidoPor.email} · {new Date(contrato.createdAt).toLocaleDateString('es-PA')}
                {firmado && contrato.firmadoPor && (
                  <> · Firmado por {contrato.firmadoPor.name ?? contrato.firmadoPor.email} el {new Date(contrato.firmadoAt!).toLocaleString('es-PA')}</>
                )}
              </p>
            </div>
            <a href={verUrl(contrato.archivoPath)} target="_blank" rel="noopener noreferrer"
              className="text-xs text-blue-500 hover:underline shrink-0">Ver original</a>
            {contrato.firmadoPath && (
              <a href={verUrl(contrato.firmadoPath)} target="_blank" rel="noopener noreferrer"
                className="text-xs font-semibold text-green-600 hover:underline shrink-0">Ver firmado</a>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {!firmado && (
              <button onClick={() => setMostrarFirma(true)} className="btn-primary text-sm">
                ✍️ Firmar contrato
              </button>
            )}
            <button onClick={() => fileRef.current?.click()} disabled={subiendo}
              className="text-xs px-3 py-1.5 rounded-xl border-2 border-gray-200 text-gray-600 hover:border-gray-400 font-medium transition-all">
              {subiendo ? 'Subiendo...' : firmado ? '🔄 Subir nueva versión (reinicia firma)' : '🔄 Reemplazar PDF'}
            </button>
            <button onClick={() => setVerFirma(v => !v)}
              className="text-xs text-gray-500 hover:text-gray-800 underline">
              {verFirma ? 'Ocultar mi firma' : '✒️ Mi firma'}
            </button>
          </div>
        </div>
      )}

      {!contrato && (
        <button onClick={() => setVerFirma(v => !v)}
          className="text-xs text-gray-500 hover:text-gray-800 underline mt-3 block">
          {verFirma ? 'Ocultar mi firma' : '✒️ Mi firma'}
        </button>
      )}

      {verFirma && <div className="mt-4"><FirmaPad /></div>}
      {error && <p className="text-red-500 text-sm mt-3">{error}</p>}

      <input ref={fileRef} type="file" accept=".pdf" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) subir(f); e.target.value = '' }} />

      {mostrarFirma && contrato && (
        <FirmarContrato
          eventoId={eventoId}
          pdfPath={contrato.archivoPath}
          onCerrar={() => setMostrarFirma(false)}
          onFirmado={c => { onChange(c as Contrato); setMostrarFirma(false) }}
        />
      )}
    </div>
  )
}

/* --------------------------- Slot de documento --------------------------- */

function SlotDocumento({ eventoId, slot, docs, onSubido, onEliminado, extra }: {
  eventoId: string
  slot: { tipo: string; icono: string; titulo: string; nota: string }
  docs: EventoDoc[]
  onSubido: (doc: EventoDoc) => void
  onEliminado: (docId: string) => void
  extra?: React.ReactNode
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [subiendo, setSubiendo] = useState(false)
  const [error,    setError]    = useState('')

  async function subir(file: File) {
    setSubiendo(true); setError('')
    try {
      const base64 = await fileToBase64(file)
      const res  = await fetch(`/api/eventos/${eventoId}/documentos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: slot.tipo, nombre: null, base64, mimeType: file.type, fileName: file.name }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Error al subir'); return }
      onSubido(data)
    } catch {
      setError('Error de conexión')
    } finally { setSubiendo(false) }
  }

  async function eliminar(docId: string) {
    if (!confirm('¿Eliminar este documento?')) return
    const res = await fetch(`/api/eventos/${eventoId}/documentos`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documentoId: docId }),
    })
    if (res.ok) onEliminado(docId)
  }

  return (
    <div className="card p-4">
      <div className="flex items-center gap-3">
        <span className="text-xl shrink-0">{docs.length > 0 ? '✅' : slot.icono}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900">{slot.titulo}</p>
          <p className="text-xs text-gray-400">{slot.nota}</p>
        </div>
        {extra}
        <button onClick={() => fileRef.current?.click()} disabled={subiendo}
          className="text-xs px-3 py-1.5 rounded-xl border-2 border-gray-200 text-gray-600 hover:border-gray-400 font-medium transition-all whitespace-nowrap">
          {subiendo ? '📤 Subiendo...' : '📤 Subir'}
        </button>
      </div>

      {docs.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {docs.map(doc => (
            <div key={doc.id} className="flex items-center gap-3 bg-gray-50 rounded-lg px-3 py-2">
              <p className="flex-1 text-xs text-gray-700 truncate">
                {doc.archivoNombre} · {new Date(doc.createdAt).toLocaleDateString('es-PA')} · {doc.subidoPor.name ?? doc.subidoPor.email}
              </p>
              <a href={verUrl(doc.archivoPath)} target="_blank" rel="noopener noreferrer"
                className="text-xs text-blue-500 hover:underline shrink-0">Ver</a>
              <button onClick={() => eliminar(doc.id)} className="text-xs text-red-400 hover:text-red-600 shrink-0">✕</button>
            </div>
          ))}
        </div>
      )}

      {error && <p className="text-red-500 text-xs mt-2">{error}</p>}
      <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) subir(f); e.target.value = '' }} />
    </div>
  )
}

/* ------------------------ Formulario comprobantes ------------------------ */

function SeccionFormulario({ eventoId, form, setForm }: {
  eventoId: string
  form: Formulario
  setForm: React.Dispatch<React.SetStateAction<Formulario>>
}) {
  const [extrayendo, setExtrayendo] = useState(false)
  const [guardando,  setGuardando]  = useState(false)
  const [mensaje,    setMensaje]    = useState('')
  const [error,      setError]      = useState('')

  const set = (campo: keyof Formulario) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(prev => ({ ...prev, [campo]: e.target.value }))

  async function llenarConIA() {
    setExtrayendo(true); setError(''); setMensaje('')
    try {
      const res  = await fetch(`/api/eventos/${eventoId}/formulario/extract`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Error al extraer'); return }
      setForm(prev => ({
        ...prev,
        ...Object.fromEntries(Object.entries(data).filter(([k, v]) => k in FORM_VACIO && v != null)),
      }))
      setMensaje('🤖 Datos extraídos — revisa y guarda')
    } catch {
      setError('Error de conexión')
    } finally { setExtrayendo(false) }
  }

  async function guardar() {
    setGuardando(true); setError(''); setMensaje('')
    try {
      const res  = await fetch(`/api/eventos/${eventoId}/formulario`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Error al guardar'); return }
      setMensaje('✅ Formulario guardado')
    } catch {
      setError('Error de conexión')
    } finally { setGuardando(false) }
  }

  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide">📋 Formulario comprobantes electrónicos</p>
        <div className="flex items-center gap-2">
          <button onClick={llenarConIA} disabled={extrayendo}
            className="text-xs px-3 py-1.5 rounded-xl border-2 border-violet-200 bg-violet-50 text-violet-700 hover:border-violet-400 font-semibold transition-all">
            {extrayendo ? '🤖 Leyendo documentos...' : '🤖 Llenar con IA'}
          </button>
          <Link href={`/admin/eventos/${eventoId}/formulario`}
            className="text-xs px-3 py-1.5 rounded-xl border-2 border-gray-200 text-gray-600 hover:border-gray-400 font-medium transition-all">
            🖨 Imprimir
          </Link>
        </div>
      </div>

      <p className="text-xs text-gray-400 mb-4">
        La IA llena estos datos leyendo el aviso de operaciones y la cédula del representante legal que subas arriba.
        Revisa, guarda e imprime para mandar a firmar.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div><label className="label">Razón social</label><input className="input" value={form.razonSocial} onChange={set('razonSocial')} /></div>
        <div><label className="label">Nombre comercial</label><input className="input" value={form.nombreComercial} onChange={set('nombreComercial')} /></div>
        <div><label className="label">RUC y DV</label><input className="input" placeholder="8-905-966 DV43" value={form.rucDv} onChange={set('rucDv')} /></div>
        <div><label className="label">Teléfonos</label><input className="input" value={form.telefonos} onChange={set('telefonos')} /></div>
        <div className="sm:col-span-2"><label className="label">Dirección completa</label><input className="input" value={form.direccion} onChange={set('direccion')} /></div>
        <div><label className="label">Provincia</label><input className="input" value={form.provincia} onChange={set('provincia')} /></div>
        <div><label className="label">Distrito</label><input className="input" value={form.distrito} onChange={set('distrito')} /></div>
        <div><label className="label">Corregimiento</label><input className="input" value={form.corregimiento} onChange={set('corregimiento')} /></div>
        <div>
          <label className="label">Organización jurídica</label>
          <select className="input" value={form.organizacion} onChange={set('organizacion')}>
            <option value="">— Seleccionar —</option>
            <option value="JURIDICA">Persona jurídica</option>
            <option value="NATURAL">Persona natural</option>
          </select>
        </div>
        <div className="sm:col-span-2"><label className="label">Correo electrónico de envío</label><input className="input" type="email" value={form.correoEnvio} onChange={set('correoEnvio')} /></div>
      </div>

      <div className="flex items-center gap-3 mt-4">
        <button onClick={guardar} disabled={guardando} className="btn-primary text-sm">
          {guardando ? 'Guardando...' : '💾 Guardar formulario'}
        </button>
        {mensaje && <span className="text-sm text-green-600">{mensaje}</span>}
        {error && <span className="text-sm text-red-500">{error}</span>}
      </div>
    </div>
  )
}

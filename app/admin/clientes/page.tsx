'use client'

import { useEffect, useRef, useState } from 'react'
import { useTenant } from '@/hooks/useTenant'
import { EnlaceRegistroPublico } from '@/components/EnlaceRegistroPublico'

interface Cliente {
  id: string
  nombreEmpresa: string
  rucDv: string
  nombreRepresentanteLegal: string
  nombreContacto: string
  telefono: string
  correo: string
  direccion: string
  avisoOperacionesPath: string | null
  avisoOperacionesNombre: string | null
  cedulaRepPath: string | null
  cedulaRepNombre: string | null
}

type FormState = {
  nombreEmpresa: string
  rucDv: string
  nombreRepresentanteLegal: string
  nombreContacto: string
  telefono: string
  correo: string
  direccion: string
}

const FORM_VACIO: FormState = {
  nombreEmpresa: '', rucDv: '', nombreRepresentanteLegal: '', nombreContacto: '',
  telefono: '', correo: '', direccion: '',
}

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

function CampoArchivo({ label, file, onChange, existente, existenteNombre }: {
  label: string
  file: File | null
  onChange: (f: File | null) => void
  existente?: string | null
  existenteNombre?: string | null
}) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <div>
      <label className="label">{label}</label>
      {existente && !file && (
        <p className="text-xs text-gray-400 mb-1.5">
          Ya tiene archivo:{' '}
          <a href={`/api/fotos?path=${encodeURIComponent(existente)}`} target="_blank" rel="noopener noreferrer"
            className="text-blue-500 hover:underline">
            {existenteNombre ?? 'ver'}
          </a>
          {' '}— al subir uno nuevo lo reemplaza
        </p>
      )}
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
          <p className="text-gray-500 text-sm">📎 {existente ? 'Reemplazar' : 'Adjuntar'} (PDF, Word o imagen)</p>
        )}
      </div>
      <input ref={ref} type="file" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) onChange(f); e.target.value = '' }} />
    </div>
  )
}

function CamposBasicos({ form, onChange }: { form: FormState; onChange: (f: FormState) => void }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="col-span-2">
        <label className="label">Nombre de Empresa *</label>
        <input className="input" required value={form.nombreEmpresa}
          onChange={e => onChange({ ...form, nombreEmpresa: e.target.value })} />
      </div>
      <div>
        <label className="label">RUC/DV *</label>
        <input className="input" required value={form.rucDv}
          onChange={e => onChange({ ...form, rucDv: e.target.value })} />
      </div>
      <div>
        <label className="label">Nombre del Representante Legal *</label>
        <input className="input" required value={form.nombreRepresentanteLegal}
          onChange={e => onChange({ ...form, nombreRepresentanteLegal: e.target.value })} />
      </div>
      <div>
        <label className="label">Nombre de Contacto *</label>
        <input className="input" required value={form.nombreContacto}
          onChange={e => onChange({ ...form, nombreContacto: e.target.value })} />
      </div>
      <div>
        <label className="label">Teléfono *</label>
        <input className="input" required value={form.telefono}
          onChange={e => onChange({ ...form, telefono: e.target.value })} />
      </div>
      <div>
        <label className="label">Correo *</label>
        <input className="input" type="email" required value={form.correo}
          onChange={e => onChange({ ...form, correo: e.target.value })} />
      </div>
      <div>
        <label className="label">Dirección *</label>
        <input className="input" required value={form.direccion}
          onChange={e => onChange({ ...form, direccion: e.target.value })} />
      </div>
    </div>
  )
}

function CreateForm({ onCreated }: { onCreated: (c: Cliente) => void }) {
  const [form, setForm] = useState<FormState>(FORM_VACIO)
  const [aviso, setAviso] = useState<File | null>(null)
  const [cedula, setCedula] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')
    const res = await fetch('/api/clientes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        avisoOperaciones: await archivoPayload(aviso),
        cedulaRep: await archivoPayload(cedula),
      }),
    })
    if (res.ok) {
      onCreated(await res.json())
      setForm(FORM_VACIO); setAviso(null); setCedula(null)
    } else {
      const data = await res.json().catch(() => null)
      setError(data?.error ?? 'Error al crear el cliente')
    }
    setLoading(false)
  }

  return (
    <div className="card p-5">
      <form onSubmit={handleSubmit} className="space-y-3">
        <CamposBasicos form={form} onChange={setForm} />
        <div className="grid grid-cols-2 gap-3">
          <CampoArchivo label="📝 Aviso de Operaciones (opcional)" file={aviso} onChange={setAviso} />
          <CampoArchivo label="🪪 Cédula del Representante Legal (opcional)" file={cedula} onChange={setCedula} />
        </div>
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <button type="submit" disabled={loading} className="btn-primary">
          {loading ? 'Guardando...' : 'Crear Cliente'}
        </button>
      </form>
    </div>
  )
}

export default function ClientesPage() {
  const { activeTenant } = useTenant()
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Cliente | null>(null)
  const [editForm, setEditForm] = useState<FormState>(FORM_VACIO)
  const [editAviso, setEditAviso] = useState<File | null>(null)
  const [editCedula, setEditCedula] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    fetch('/api/clientes')
      .then(r => r.json())
      .then(d => setClientes(Array.isArray(d) ? d : []))
      .finally(() => setCargando(false))
  }, [])

  if (activeTenant && activeTenant.slug !== 'printmediapty') {
    return (
      <div className="card p-8 text-center">
        <p className="text-3xl mb-3">🔒</p>
        <p className="text-gray-700 font-semibold">Este registro es exclusivo de Print Media PTY.</p>
        <p className="text-gray-400 text-sm mt-1">Cambia de empresa para acceder.</p>
      </div>
    )
  }

  function handleCreated(c: Cliente) {
    setClientes(prev => [...prev, c].sort((a, b) => a.nombreEmpresa.localeCompare(b.nombreEmpresa)))
    setShowForm(false)
  }

  function abrirEdicion(c: Cliente) {
    setEditing(c)
    setEditForm({
      nombreEmpresa: c.nombreEmpresa, rucDv: c.rucDv,
      nombreRepresentanteLegal: c.nombreRepresentanteLegal, nombreContacto: c.nombreContacto,
      telefono: c.telefono, correo: c.correo, direccion: c.direccion,
    })
    setEditAviso(null); setEditCedula(null)
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editing) return
    setLoading(true)
    const res = await fetch(`/api/clientes/${editing.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...editForm,
        avisoOperaciones: await archivoPayload(editAviso),
        cedulaRep: await archivoPayload(editCedula),
      }),
    })
    if (res.ok) {
      const updated = await res.json()
      setClientes(prev => prev.map(c => c.id === updated.id ? updated : c))
      setEditing(null)
    }
    setLoading(false)
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Desactivar este cliente?')) return
    const res = await fetch(`/api/clientes/${id}`, { method: 'DELETE' })
    if (res.ok) setClientes(prev => prev.filter(c => c.id !== id))
  }

  const filtered = clientes.filter(c =>
    c.nombreEmpresa.toLowerCase().includes(search.toLowerCase()) ||
    c.nombreContacto.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Clientes</h1>
          <p className="text-gray-500 mt-1">{clientes.length} cliente(s) registrado(s)</p>
        </div>
        <button onClick={() => setShowForm(v => !v)} className="btn-primary">
          {showForm ? 'Cancelar' : '+ Nuevo Cliente'}
        </button>
      </div>

      <EnlaceRegistroPublico ruta="/registro/clientes" etiqueta="tus clientes" />

      {showForm && <CreateForm onCreated={handleCreated} />}

      <input className="input max-w-sm" placeholder="Buscar por empresa o contacto..."
        value={search} onChange={e => setSearch(e.target.value)} />

      <div className="space-y-2">
        {filtered.map(c => (
          <div key={c.id} className="card p-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-gray-900">{c.nombreEmpresa}</p>
                  <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">RUC/DV: {c.rucDv}</span>
                  {c.avisoOperacionesPath && (
                    <a href={`/api/fotos?path=${encodeURIComponent(c.avisoOperacionesPath)}`} target="_blank" rel="noopener noreferrer"
                      className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full hover:bg-green-200 transition-colors">
                      📝 Aviso de Operaciones
                    </a>
                  )}
                  {c.cedulaRepPath && (
                    <a href={`/api/fotos?path=${encodeURIComponent(c.cedulaRepPath)}`} target="_blank" rel="noopener noreferrer"
                      className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full hover:bg-blue-200 transition-colors">
                      🪪 Cédula Rep. Legal
                    </a>
                  )}
                </div>
                <p className="text-gray-500 text-sm mt-1">Representante: {c.nombreRepresentanteLegal}</p>
                <p className="text-gray-400 text-xs mt-0.5">
                  {c.nombreContacto} · {c.telefono} · {c.correo}
                </p>
                <p className="text-gray-400 text-xs mt-0.5">📍 {c.direccion}</p>
              </div>
              <div className="flex gap-1 shrink-0 ml-2">
                <button onClick={() => abrirEdicion(c)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-all">✏️</button>
                <button onClick={() => handleDelete(c.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-300 transition-all">🗑</button>
              </div>
            </div>
          </div>
        ))}
        {!cargando && filtered.length === 0 && (
          <div className="card p-8 text-center">
            <p className="text-3xl mb-3">🧑‍💼</p>
            <p className="text-gray-700 font-semibold">No hay clientes aún</p>
          </div>
        )}
      </div>

      {editing && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="card p-6 w-full max-w-lg shadow-2xl my-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-900">Editar Cliente</h2>
              <button onClick={() => setEditing(null)} className="text-gray-400 hover:text-gray-700">✕</button>
            </div>
            <form onSubmit={handleEdit} className="space-y-3">
              <CamposBasicos form={editForm} onChange={setEditForm} />
              <CampoArchivo label="📝 Aviso de Operaciones" file={editAviso} onChange={setEditAviso}
                existente={editing.avisoOperacionesPath} existenteNombre={editing.avisoOperacionesNombre} />
              <CampoArchivo label="🪪 Cédula del Representante Legal" file={editCedula} onChange={setEditCedula}
                existente={editing.cedulaRepPath} existenteNombre={editing.cedulaRepNombre} />
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setEditing(null)} className="btn-ghost flex-1">Cancelar</button>
                <button type="submit" disabled={loading} className="btn-primary flex-1">
                  {loading ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

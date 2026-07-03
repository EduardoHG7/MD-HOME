'use client'

import { useState, useRef, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'

const TERMINOS = `TÉRMINOS Y CONDICIONES - PERSONAL EVENTUAL MAGIC DREAMS PRODUCTIONS

1. OBJETO
El presente documento establece los términos bajo los cuales el personal eventual presta servicios a Magic Dreams Productions para eventos específicos.

2. NATURALEZA DEL SERVICIO
La prestación de servicios es de carácter eventual y no genera relación laboral permanente. Cada evento constituye un contrato independiente.

3. OBLIGACIONES DEL COLABORADOR
- Presentarse puntualmente al turno asignado.
- Registrar entrada y salida mediante el código QR personal.
- Mantener conducta profesional durante el evento.
- Usar el uniforme o vestimenta indicada por el coordinador.
- Guardar confidencialidad sobre las operaciones del evento.

4. SISTEMA DE REGISTRO QR
El código QR personal es intransferible. Está prohibido compartir capturas de pantalla del código QR. El sistema verifica la autenticidad del código en tiempo real.

5. PAGO
El pago se realizará en la cuenta bancaria registrada, según la tarifa acordada para el evento correspondiente, dentro de los 5 días hábiles tras la finalización del evento.

6. PROTECCIÓN DE DATOS
Los datos personales proporcionados serán tratados conforme a las leyes de protección de datos aplicables y usados exclusivamente para la gestión de personal en Magic Dreams Productions.

7. SANCIONES
El incumplimiento de las presentes condiciones podrá resultar en la exclusión del banco de candidatos de Magic Dreams Productions.

Al hacer clic en "Acepto los Términos y Condiciones", confirmas que has leído, entendido y aceptas todas las disposiciones aquí establecidas.`

type Step = 'empresa' | 'form' | 'fotos' | 'terms' | 'done'

interface FotoState {
  preview: string | null
  url:     string | null
  loading: boolean
}

interface TenantOption {
  id: string; nombre: string; logo: string | null
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload  = () => resolve((reader.result as string).split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export default function RegistroAplicantePage() {
  const [step,        setStep]        = useState<Step>('empresa')
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState('')
  const [applicantId, setApplicantId] = useState('')
  const [termsRead,   setTermsRead]   = useState(false)

  const [tenants,          setTenants]          = useState<TenantOption[]>([])
  const [selectedTenantId, setSelectedTenantId] = useState('')

  const [form, setForm] = useState({
    nombreCompleto: '', cedula: '', telefono: '',
    email: '', cuentaBancaria: '',
    banco: '', tipoCuenta: '',
    password: '', confirmPassword: '',
  })

  const [fotos, setFotos] = useState<{
    fotoPersonal:  FotoState
    fotoCedula:    FotoState
    fotoConCedula: FotoState
  }>({
    fotoPersonal:  { preview: null, url: null, loading: false },
    fotoCedula:    { preview: null, url: null, loading: false },
    fotoConCedula: { preview: null, url: null, loading: false },
  })

  const inputPersonal  = useRef<HTMLInputElement>(null)
  const inputCedula    = useRef<HTMLInputElement>(null)
  const inputConCedula = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch('/api/empresas-publicas')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          setTenants(data)
        } else {
          // Fallback estático mientras se resuelve el endpoint
          setTenants([
            { id: 'fallback-md',   nombre: 'Magic Dreams Productions', logo: '/logo.png' },
            { id: 'fallback-pt',   nombre: 'Panatickets',              logo: '/logo_panatickets.png' },
            { id: 'fallback-me',   nombre: 'Master Events PTY',        logo: '/logo_masterevents.png' },
            { id: 'fallback-pm',   nombre: 'Print Media PTY',          logo: '/logo_printmedia.png' },
          ])
        }
      })
      .catch(() => {
        setTenants([
          { id: 'fallback-md',   nombre: 'Magic Dreams Productions', logo: '/logo.png' },
          { id: 'fallback-pt',   nombre: 'Panatickets',              logo: '/logo_panatickets.png' },
          { id: 'fallback-me',   nombre: 'Master Events PTY',        logo: '/logo_masterevents.png' },
          { id: 'fallback-pm',   nombre: 'Print Media PTY',          logo: '/logo_printmedia.png' },
        ])
      })
  }, [])

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
    setError('')
  }

  function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.nombreCompleto || !form.cedula || !form.telefono || !form.email || !form.cuentaBancaria || !form.banco || !form.tipoCuenta) {
      setError('Por favor completa todos los campos.'); return
    }
    if (!form.password || form.password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.'); return
    }
    if (form.password !== form.confirmPassword) {
      setError('Las contraseñas no coinciden.'); return
    }
    setStep('fotos')
  }

  async function handleFotoSelect(tipo: 'fotoPersonal' | 'fotoCedula' | 'fotoConCedula', file: File) {
    const preview = URL.createObjectURL(file)
    setFotos(prev => ({ ...prev, [tipo]: { preview, url: null, loading: true } }))
    try {
      const base64 = await fileToBase64(file)
      const res = await fetch('/api/upload/foto', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64, mimeType: file.type, cedula: form.cedula, tipo }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error al subir')
      setFotos(prev => ({ ...prev, [tipo]: { preview, url: data.url, loading: false } }))
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error'
      setFotos(prev => ({ ...prev, [tipo]: { preview: null, url: null, loading: false } }))
      setError(`Error subiendo foto: ${msg}`)
    }
  }

  async function handleAcceptTerms() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/aplicantes', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombreCompleto: form.nombreCompleto,
          cedula:         form.cedula,
          telefono:       form.telefono,
          email:          form.email,
          cuentaBancaria: form.cuentaBancaria,
          banco:          form.banco,
          tipoCuenta:     form.tipoCuenta,
          password:       form.password,
          fotoPersonal:   fotos.fotoPersonal.url,
          fotoCedula:     fotos.fotoCedula.url,
          fotoConCedula:  fotos.fotoConCedula.url,
          tenantId:       selectedTenantId || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Error al registrar.'); setStep('form'); return }
      setApplicantId(data.id)
      setStep('done')
    } catch {
      setError('Error de conexión.'); setStep('form')
    } finally { setLoading(false) }
  }

  const selectedTenant = tenants.find(t => t.id === selectedTenantId)

  /* ─── DONE ─── */
  if (step === 'done') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="card p-10 max-w-md w-full text-center border-t-4 border-t-green-400">
          <div className="text-5xl mb-4">🎉</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">¡Registro Exitoso!</h2>
          <p className="text-gray-500 mb-6">
            Bienvenido(a) al equipo de colaboradores eventuales
            {selectedTenant ? ` de ${selectedTenant.nombre}` : ''}.
          </p>
          <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 mb-6 text-left space-y-2">
            <div>
              <p className="text-gray-400 text-xs">Tu nombre</p>
              <p className="text-gray-900 font-semibold">{form.nombreCompleto}</p>
            </div>
            <div>
              <p className="text-gray-400 text-xs">Tu usuario (cédula)</p>
              <p className="text-gray-900 font-semibold">{form.cedula}</p>
            </div>
          </div>
          <Link href="/aplicante/login" className="btn-primary block text-center mb-3">
            Iniciar sesión en mi cuenta
          </Link>
          <a href={`/aplicante/${applicantId}`} className="text-sm text-gray-400 hover:text-gray-600 underline">
            Ver mi QR de asistencia
          </a>
        </div>
      </div>
    )
  }

  /* ─── TERMS ─── */
  if (step === 'terms') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-10">
        <div className="card p-8 max-w-2xl w-full">
          <h2 className="text-xl font-bold text-gray-900 mb-1">Términos y Condiciones</h2>
          <p className="text-gray-500 text-sm mb-4">Desplázate hasta el final para poder aceptar.</p>
          <div
            className="bg-gray-50 border border-gray-200 rounded-xl p-5 h-72 overflow-y-auto text-gray-700 text-sm leading-relaxed mb-4"
            onScroll={e => {
              const el = e.currentTarget
              if (el.scrollHeight - el.scrollTop - el.clientHeight < 30) setTermsRead(true)
            }}
          >
            <pre className="whitespace-pre-wrap font-sans">{TERMINOS}</pre>
          </div>
          {!termsRead && (
            <p className="text-amber-600 text-xs mb-4">⬇ Desplázate hasta el final para aceptar</p>
          )}
          {error && <p className="text-red-600 text-sm mb-4">{error}</p>}
          <div className="flex gap-3">
            <button onClick={() => setStep('fotos')} className="btn-ghost flex-1">Atrás</button>
            <button onClick={handleAcceptTerms} disabled={!termsRead || loading} className="btn-primary flex-1">
              {loading ? 'Registrando...' : 'Acepto los Términos y Condiciones'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  /* ─── FOTOS ─── */
  if (step === 'fotos') {
    const allUploaded = fotos.fotoPersonal.url && fotos.fotoCedula.url && fotos.fotoConCedula.url
    const anyLoading  = fotos.fotoPersonal.loading || fotos.fotoCedula.loading || fotos.fotoConCedula.loading

    const FOTO_CONFIG = [
      { tipo: 'fotoPersonal'  as const, label: 'Tu foto',         desc: 'Selfie clara de tu rostro',                    icon: '🤳', ref: inputPersonal  },
      { tipo: 'fotoCedula'    as const, label: 'Tu cédula',       desc: 'Foto nítida del frente de tu cédula',           icon: '🪪', ref: inputCedula    },
      { tipo: 'fotoConCedula' as const, label: 'Tú con tu cédula', desc: 'Sosteniendo tu cédula junto a tu rostro',      icon: '📸', ref: inputConCedula },
    ]

    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-10">
        <div className="card p-8 max-w-lg w-full">
          <h2 className="text-xl font-bold text-gray-900 mb-1">Verificación de identidad</h2>
          <p className="text-gray-500 text-sm mb-6">
            Sube las siguientes fotos para verificar tu identidad. Las fotos se guardan de forma segura.
          </p>
          {error && <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl px-4 py-3 mb-4 text-sm">{error}</div>}
          <div className="space-y-4 mb-6">
            {FOTO_CONFIG.map(({ tipo, label, desc, icon, ref }) => {
              const estado = fotos[tipo]
              return (
                <div key={tipo}>
                  <input ref={ref} type="file" accept="image/*" capture="environment" className="hidden"
                    onChange={e => e.target.files?.[0] && handleFotoSelect(tipo, e.target.files[0])} />
                  <button type="button" onClick={() => ref.current?.click()} disabled={estado.loading}
                    className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all text-left ${
                      estado.url ? 'border-green-400 bg-green-50' : 'border-gray-200 bg-white hover:border-gray-400'
                    }`}>
                    {estado.preview
                      ? <img src={estado.preview} alt={label} className="w-16 h-16 rounded-xl object-cover shrink-0 border border-gray-200" />
                      : <div className="w-16 h-16 rounded-xl bg-gray-100 flex items-center justify-center text-2xl shrink-0">{icon}</div>
                    }
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900">{label}</p>
                      <p className="text-gray-400 text-xs mt-0.5">{desc}</p>
                    </div>
                    <span className="shrink-0 text-sm font-medium">{estado.loading ? '⏳' : estado.url ? '✅' : '📷'}</span>
                  </button>
                </div>
              )
            })}
          </div>
          {!allUploaded && <p className="text-amber-600 text-xs mb-4 text-center">Las 3 fotos son necesarias para continuar</p>}
          <div className="flex gap-3">
            <button onClick={() => setStep('form')} className="btn-ghost flex-1">Atrás</button>
            <button onClick={() => setStep('terms')} disabled={!allUploaded || anyLoading} className="btn-primary flex-1">
              {anyLoading ? 'Subiendo fotos...' : 'Continuar →'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  /* ─── SELECCIÓN DE EMPRESA ─── */
  if (step === 'empresa') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <Image src="/logo.png" alt="Logo" width={180} height={90} className="mx-auto object-contain" priority />
          </div>
          <div className="card p-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">¿Para qué empresa te registras?</h2>
            <p className="text-gray-500 text-sm mb-6">Selecciona la empresa en la que trabajarás como personal eventual.</p>
            <div className="space-y-3 mb-6">
              {tenants.map(t => (
                <button
                  key={t.id}
                  onClick={() => setSelectedTenantId(t.id)}
                  className={`w-full flex items-center gap-4 px-4 py-3 rounded-xl border-2 transition-all text-left ${
                    selectedTenantId === t.id
                      ? 'border-gray-900 bg-gray-50'
                      : 'border-gray-200 hover:border-gray-400'
                  }`}
                >
                  <div className="w-10 h-10 rounded-lg bg-gray-100 overflow-hidden flex items-center justify-center shrink-0">
                    {t.logo
                      ? <Image src={t.logo} alt={t.nombre} width={40} height={40} className="object-contain" />
                      : <span className="text-xl">🏢</span>
                    }
                  </div>
                  <span className="font-medium text-gray-900">{t.nombre}</span>
                  {selectedTenantId === t.id && <span className="ml-auto text-gray-900">✓</span>}
                </button>
              ))}
            </div>
            <button
              onClick={() => setStep('form')}
              disabled={!selectedTenantId}
              className="btn-primary w-full"
            >
              Continuar →
            </button>
            <p className="text-center text-gray-400 text-xs mt-4">
              ¿Ya tienes cuenta?{' '}
              <Link href="/aplicante/login" className="text-gray-900 font-semibold hover:underline">Iniciar sesión</Link>
            </p>
          </div>
        </div>
      </div>
    )
  }

  /* ─── FORM ─── */
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          {selectedTenant?.logo
            ? <Image src={selectedTenant.logo} alt={selectedTenant.nombre} width={180} height={90} className="mx-auto object-contain" priority />
            : <Image src="/logo.png" alt="Logo" width={180} height={90} className="mx-auto object-contain" priority />
          }
          {selectedTenant && <p className="text-gray-500 text-sm mt-2">{selectedTenant.nombre}</p>}
        </div>

        <div className="card p-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-6">Registro de Personal Eventual</h2>
          {error && <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl px-4 py-3 mb-4 text-sm">{error}</div>}

          <form onSubmit={handleFormSubmit} className="space-y-4">
            <div>
              <label className="label">Nombre completo *</label>
              <input name="nombreCompleto" value={form.nombreCompleto} onChange={handleChange}
                className="input" placeholder="Ej: Juan Carlos Pérez López" required />
            </div>
            <div>
              <label className="label">Número de cédula *</label>
              <input name="cedula" value={form.cedula} onChange={handleChange}
                className="input" placeholder="Ej: 1-2345-6789" required />
            </div>
            <div>
              <label className="label">Teléfono *</label>
              <input name="telefono" value={form.telefono} onChange={handleChange}
                className="input" placeholder="Ej: 8888-8888" required />
            </div>
            <div>
              <label className="label">Correo electrónico *</label>
              <input name="email" type="email" value={form.email} onChange={handleChange}
                className="input" placeholder="tucorreo@email.com" required />
            </div>
            <div>
              <label className="label">Cuenta bancaria (IBAN) *</label>
              <input name="cuentaBancaria" value={form.cuentaBancaria} onChange={handleChange}
                className="input" placeholder="Ej: PA21001200009123456789" required />
            </div>
            <div>
              <label className="label">Banco *</label>
              <select name="banco" value={form.banco}
                onChange={e => { setForm(prev => ({ ...prev, banco: e.target.value })); setError('') }}
                className="input" required>
                <option value="">Selecciona tu banco</option>
                <option value="Banco General">Banco General</option>
                <option value="Banistmo">Banistmo</option>
                <option value="BAC">BAC</option>
                <option value="Banisi">Banisi</option>
              </select>
            </div>
            <div>
              <label className="label">Tipo de cuenta *</label>
              <select name="tipoCuenta" value={form.tipoCuenta}
                onChange={e => { setForm(prev => ({ ...prev, tipoCuenta: e.target.value })); setError('') }}
                className="input" required>
                <option value="">Selecciona el tipo de cuenta</option>
                <option value="AHORRO">Cuenta de Ahorro</option>
                <option value="CORRIENTE">Cuenta Corriente</option>
              </select>
            </div>
            <div className="border-t border-gray-100 pt-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Crea tu contraseña</p>
              <div className="space-y-3">
                <div>
                  <label className="label">Contraseña * (mínimo 6 caracteres)</label>
                  <input name="password" type="password" value={form.password} onChange={handleChange}
                    className="input" placeholder="••••••••" required autoComplete="new-password" />
                </div>
                <div>
                  <label className="label">Confirmar contraseña *</label>
                  <input name="confirmPassword" type="password" value={form.confirmPassword} onChange={handleChange}
                    className="input" placeholder="••••••••" required autoComplete="new-password" />
                </div>
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setStep('empresa')} className="btn-ghost flex-1">Atrás</button>
              <button type="submit" className="btn-primary flex-1">Continuar →</button>
            </div>
          </form>

          <p className="text-center text-gray-400 text-xs mt-6">
            ¿Ya tienes cuenta?{' '}
            <Link href="/aplicante/login" className="text-gray-900 font-semibold hover:underline">Iniciar sesión</Link>
          </p>
        </div>
      </div>
    </div>
  )
}

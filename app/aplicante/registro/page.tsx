'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const TERMINOS = `TÉRMINOS Y CONDICIONES - PERSONAL EVENTUAL MAGIC DREAMS

1. OBJETO
El presente documento establece los términos bajo los cuales el personal eventual presta servicios a Magic Dreams para eventos específicos.

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
Los datos personales proporcionados serán tratados conforme a las leyes de protección de datos aplicables y usados exclusivamente para la gestión de personal en Magic Dreams.

7. SANCIONES
El incumplimiento de las presentes condiciones podrá resultar en la exclusión del banco de candidatos de Magic Dreams.

Al hacer clic en "Acepto los Términos y Condiciones", confirmas que has leído, entendido y aceptas todas las disposiciones aquí establecidas.`

export default function RegistroAplicantePage() {
  const router = useRouter()
  const [step, setStep] = useState<'form' | 'terms' | 'done'>('form')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [applicantId, setApplicantId] = useState('')
  const [termsRead, setTermsRead] = useState(false)

  const [form, setForm] = useState({
    nombreCompleto: '',
    cedula: '',
    telefono: '',
    email: '',
    cuentaBancaria: '',
  })

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
    setError('')
  }

  function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.nombreCompleto || !form.cedula || !form.telefono || !form.email || !form.cuentaBancaria) {
      setError('Por favor completa todos los campos.')
      return
    }
    setStep('terms')
  }

  async function handleAcceptTerms() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/aplicantes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Error al registrar. Intenta de nuevo.')
        setStep('form')
        return
      }
      setApplicantId(data.id)
      setStep('done')
    } catch {
      setError('Error de conexión. Intenta de nuevo.')
      setStep('form')
    } finally {
      setLoading(false)
    }
  }

  if (step === 'done') {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="card card-gold p-10 max-w-md w-full text-center">
          <div className="text-5xl mb-4">🎉</div>
          <h2 className="text-2xl font-bold text-white mb-2">¡Registro Exitoso!</h2>
          <p className="text-brand-300 mb-6">
            Bienvenido(a) al equipo de colaboradores eventuales de Magic Dreams.
          </p>
          <div className="bg-brand-900/60 rounded-xl p-4 mb-6 text-left">
            <p className="text-brand-400 text-sm">Tu nombre:</p>
            <p className="text-white font-semibold">{form.nombreCompleto}</p>
            <p className="text-brand-400 text-sm mt-2">Tu correo:</p>
            <p className="text-white font-semibold">{form.email}</p>
          </div>
          <p className="text-brand-400 text-sm mb-6">
            Cuando seas asignado a un evento, recibirás acceso a tu código QR de asistencia.
          </p>
          <a href={`/aplicante/${applicantId}`} className="btn-gold block">
            Ver mi perfil y QR
          </a>
        </div>
      </div>
    )
  }

  if (step === 'terms') {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-10">
        <div className="card p-8 max-w-2xl w-full">
          <h2 className="text-xl font-bold text-white mb-1">Términos y Condiciones</h2>
          <p className="text-brand-400 text-sm mb-4">Lee el documento completo antes de aceptar.</p>

          <div
            className="bg-brand-900/60 rounded-xl p-5 h-72 overflow-y-auto text-brand-200 text-sm leading-relaxed mb-4 border border-brand-700/40"
            onScroll={(e) => {
              const el = e.currentTarget
              if (el.scrollHeight - el.scrollTop - el.clientHeight < 30) setTermsRead(true)
            }}
          >
            <pre className="whitespace-pre-wrap font-sans">{TERMINOS}</pre>
          </div>

          {!termsRead && (
            <p className="text-gold-400 text-xs mb-4 flex items-center gap-2">
              <span>⬇</span> Desplázate hasta el final para poder aceptar
            </p>
          )}

          {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

          <div className="flex gap-3">
            <button onClick={() => setStep('form')} className="btn-ghost flex-1">
              Atrás
            </button>
            <button
              onClick={handleAcceptTerms}
              disabled={!termsRead || loading}
              className="btn-gold flex-1"
            >
              {loading ? 'Registrando...' : 'Acepto los Términos y Condiciones'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-brand-800/60 border border-gold-500/40 mb-3">
            <span className="text-2xl">✨</span>
          </div>
          <h1 className="text-2xl font-bold text-white">Magic Dreams</h1>
          <p className="text-brand-400 text-sm">Registro de Personal Eventual</p>
        </div>

        <div className="card p-8">
          <h2 className="text-lg font-semibold text-white mb-6">Completa tu información</h2>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl px-4 py-3 mb-4 text-sm">
              {error}
            </div>
          )}

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
                className="input" placeholder="Ej: CR21015200009123456789" required />
            </div>

            <button type="submit" className="btn-primary w-full mt-2">
              Continuar →
            </button>
          </form>

          <p className="text-center text-brand-500 text-xs mt-6">
            ¿Ya tienes cuenta?{' '}
            <a href="/login" className="text-gold-400 hover:text-gold-300">Iniciar sesión</a>
          </p>
        </div>
      </div>
    </div>
  )
}

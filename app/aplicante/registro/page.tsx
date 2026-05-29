'use client'

import { useState } from 'react'
import Image from 'next/image'

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

export default function RegistroAplicantePage() {
  const [step, setStep]       = useState<'form' | 'terms' | 'done'>('form')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const [applicantId, setApplicantId] = useState('')
  const [termsRead, setTermsRead]     = useState(false)

  const [form, setForm] = useState({
    nombreCompleto: '', cedula: '', telefono: '', email: '', cuentaBancaria: '',
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
      if (!res.ok) { setError(data.error ?? 'Error al registrar.'); setStep('form'); return }
      setApplicantId(data.id)
      setStep('done')
    } catch {
      setError('Error de conexión.')
      setStep('form')
    } finally { setLoading(false) }
  }

  if (step === 'done') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="card p-10 max-w-md w-full text-center border-t-4 border-t-green-400">
          <div className="text-5xl mb-4">🎉</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">¡Registro Exitoso!</h2>
          <p className="text-gray-500 mb-6">
            Bienvenido(a) al equipo de colaboradores eventuales de Magic Dreams Productions.
          </p>
          <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 mb-6 text-left">
            <p className="text-gray-400 text-xs">Tu nombre:</p>
            <p className="text-gray-900 font-semibold">{form.nombreCompleto}</p>
            <p className="text-gray-400 text-xs mt-2">Tu correo:</p>
            <p className="text-gray-900 font-semibold">{form.email}</p>
          </div>
          <p className="text-gray-500 text-sm mb-6">
            Cuando seas asignado a un evento, recibirás acceso a tu código QR de asistencia.
          </p>
          <a href={`/aplicante/${applicantId}`} className="btn-primary block text-center">
            Ver mi perfil y QR
          </a>
        </div>
      </div>
    )
  }

  if (step === 'terms') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-10">
        <div className="card p-8 max-w-2xl w-full">
          <h2 className="text-xl font-bold text-gray-900 mb-1">Términos y Condiciones</h2>
          <p className="text-gray-500 text-sm mb-4">Desplázate hasta el final para poder aceptar.</p>

          <div
            className="bg-gray-50 border border-gray-200 rounded-xl p-5 h-72 overflow-y-auto text-gray-700 text-sm leading-relaxed mb-4"
            onScroll={(e) => {
              const el = e.currentTarget
              if (el.scrollHeight - el.scrollTop - el.clientHeight < 30) setTermsRead(true)
            }}
          >
            <pre className="whitespace-pre-wrap font-sans">{TERMINOS}</pre>
          </div>

          {!termsRead && (
            <p className="text-amber-600 text-xs mb-4 flex items-center gap-1">
              ⬇ Desplázate hasta el final para poder aceptar
            </p>
          )}

          {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

          <div className="flex gap-3">
            <button onClick={() => setStep('form')} className="btn-ghost flex-1">Atrás</button>
            <button onClick={handleAcceptTerms} disabled={!termsRead || loading} className="btn-primary flex-1">
              {loading ? 'Registrando...' : 'Acepto los Términos y Condiciones'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <Image src="/logo.png" alt="Magic Dreams Productions" width={200} height={100} className="mx-auto object-contain" priority />
          <p className="text-gray-500 text-sm mt-2 tracking-widest uppercase">Registro de Personal Eventual</p>
        </div>

        <div className="card p-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-6">Completa tu información</h2>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl px-4 py-3 mb-4 text-sm">{error}</div>
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
            <button type="submit" className="btn-primary w-full mt-2">Continuar →</button>
          </form>

          <p className="text-center text-gray-400 text-xs mt-6">
            ¿Ya tienes cuenta?{' '}
            <a href="/login" className="text-brand-700 hover:text-brand-900 font-medium">Iniciar sesión</a>
          </p>
        </div>
      </div>
    </div>
  )
}

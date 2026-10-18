'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div>
      <p className="text-sm text-gray-400 mb-1">{label}</p>
      <div className="flex gap-2">
        <input
          readOnly
          value={value}
          onFocus={(e) => e.currentTarget.select()}
          className="flex-1 rounded-lg px-3 py-2 bg-white text-xs font-mono outline-none"
        />
        <button
          onClick={async () => {
            await navigator.clipboard.writeText(value)
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          }}
          className="rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm px-3"
        >
          {copied ? 'Copiado' : 'Copiar'}
        </button>
      </div>
    </div>
  )
}

export default function PuntoActions({
  puntoId,
  nombre,
  activo,
  webhookUrl,
  kioskUrl,
}: {
  puntoId: string
  nombre: string
  activo: boolean
  webhookUrl: string
  kioskUrl: string
}) {
  const router = useRouter()
  const [testing, setTesting] = useState(false)
  const [testMsg, setTestMsg] = useState('')

  async function testPrint() {
    setTesting(true)
    setTestMsg('')
    const res = await fetch(`/api/puntos/${puntoId}/test-print`, { method: 'POST' })
    setTesting(false)
    setTestMsg(res.ok ? 'Boleto de prueba enviado. Revisa la pantalla del punto.' : 'Falló el envío de prueba.')
    router.refresh()
  }

  async function toggleActivo() {
    await fetch(`/api/puntos/${puntoId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activo: !activo }),
    })
    router.refresh()
  }

  async function eliminar() {
    if (!confirm(`¿Eliminar el punto "${nombre}"? Se borrará también su historial de boletos.`)) return
    await fetch(`/api/puntos/${puntoId}`, { method: 'DELETE' })
    router.push('/admin/puntos')
    router.refresh()
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-white/10 p-4 space-y-4">
        <CopyField label="URL para el Postback / Post-Scan Submit en CodeREADr" value={webhookUrl} />
        <CopyField label="URL de la pantalla de impresión (ábrela en la compu del punto, en pantalla completa)" value={kioskUrl} />
      </div>

      <div className="flex flex-wrap gap-3">
        <button onClick={testPrint} disabled={testing} className="rounded-lg bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white text-sm px-4 py-2">
          {testing ? 'Enviando…' : 'Enviar boleto de prueba'}
        </button>
        <a
          href={kioskUrl}
          target="_blank"
          rel="noreferrer"
          className="rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm px-4 py-2"
        >
          Abrir pantalla de impresión
        </a>
        <button onClick={toggleActivo} className="rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm px-4 py-2">
          {activo ? 'Desactivar punto' : 'Activar punto'}
        </button>
        <button onClick={eliminar} className="rounded-lg bg-red-600/20 hover:bg-red-600/30 text-red-300 text-sm px-4 py-2">
          Eliminar punto
        </button>
      </div>
      {testMsg && <p className="text-sm text-gray-400">{testMsg}</p>}
    </div>
  )
}

export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

const SYSTEM_PROMPT = `Eres un extractor especializado de facturas panameñas.
Analiza esta factura y responde ÚNICAMENTE con un objeto JSON válido (sin backticks, sin texto extra) con esta estructura exacta:
{
  "numero_factura": "últimos 4 dígitos o null",
  "proveedor": "nombre del proveedor o null",
  "ruc_dv": "RUC con DV o null",
  "descripcion": "descripción breve del bien/servicio o null",
  "fecha_emision": "DD/MM/YYYY o null",
  "subtotal": número sin símbolo o 0,
  "itbms": número sin símbolo o 0,
  "total": número sin símbolo o 0
}
Si un campo no aparece, usa null para texto y 0 para montos. Los montos sin símbolo de moneda.`

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'API key de Claude no configurada' }, { status: 500 })

  const { base64, mimeType, fileName } = await req.json()
  if (!base64 || !mimeType) return NextResponse.json({ error: 'Faltan datos del archivo' }, { status: 400 })

  const isPdf = mimeType === 'application/pdf'
  const contentBlock = isPdf
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
    : { type: 'image',    source: { type: 'base64', media_type: mimeType,            data: base64 } }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
      'content-type':      'application/json',
    },
    body: JSON.stringify({
      model:      'claude-opus-4-5',
      max_tokens: 1024,
      system:     SYSTEM_PROMPT,
      messages: [{ role: 'user', content: [contentBlock] }],
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    return NextResponse.json({ error: `Error de Claude: ${err}` }, { status: 500 })
  }

  const result = await response.json()
  const text   = result.content?.[0]?.text ?? ''

  try {
    const parsed = JSON.parse(text)
    let fechaPago: string | null = null
    if (parsed.fecha_emision) {
      const [d, m, y] = parsed.fecha_emision.split('/')
      const date = new Date(Number(y), Number(m) - 1, Number(d))
      date.setDate(date.getDate() + 30)
      fechaPago = `${String(date.getDate()).padStart(2,'0')}/${String(date.getMonth()+1).padStart(2,'0')}/${date.getFullYear()}`
    }
    return NextResponse.json({
      numeroFactura: parsed.numero_factura ?? null,
      proveedor:     parsed.proveedor     ?? null,
      rucDv:         parsed.ruc_dv        ?? null,
      descripcion:   parsed.descripcion   ?? null,
      fechaEmision:  parsed.fecha_emision ?? null,
      fechaPago,
      subtotal:      Number(parsed.subtotal) || 0,
      itbms:         Number(parsed.itbms)    || 0,
      total:         Number(parsed.total)    || 0,
      archivoNombre: fileName ?? null,
    })
  } catch {
    return NextResponse.json({ error: 'Claude no devolvió un JSON válido', raw: text }, { status: 422 })
  }
}

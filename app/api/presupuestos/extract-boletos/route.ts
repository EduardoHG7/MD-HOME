export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'API key de Claude no configurada' }, { status: 500 })

  const { base64, mimeType, zonasPresupuesto } = await req.json()
  if (!base64 || !mimeType) return NextResponse.json({ error: 'Faltan datos' }, { status: 400 })

  // Construir descripción de zonas del presupuesto para que Claude haga el match
  const zonasDesc = (zonasPresupuesto ?? [])
    .map((z: { zona: string; ticketPriceUsd: number }) => `- Zona "${z.zona}": precio USD $${z.ticketPriceUsd}`)
    .join('\n')

  const systemPrompt = `Eres un experto en análisis de reportes de ventas de boletos para eventos.
Tu tarea es analizar una imagen de reporte de ventas de boletos reales y agrupar los datos por precio, relacionándolos con las zonas del presupuesto.

ZONAS DEL PRESUPUESTO (referencia de precios):
${zonasDesc || '(No hay zonas definidas en el presupuesto — detecta las que encuentres)'}

Reglas:
- Lee todos los boletos vendidos de la imagen
- Agrupa por precio: si hay varios registros con el mismo precio, SUMA los boletos vendidos y el monto total
- Relaciona cada precio con la zona del presupuesto que tenga el mismo o más cercano precio
- Si no hay zona en el presupuesto que coincida, crea una nueva entrada con el nombre del precio
- Retorna SOLO el JSON, sin texto adicional ni backticks

Responde con este JSON exacto:
{
  "zonas": [
    {
      "zona": "nombre de la zona (usa el nombre del presupuesto si hay match, si no el precio como nombre)",
      "vendidos": número total de boletos vendidos en esta zona/precio,
      "precio": precio unitario en USD (número),
      "totalUsd": vendidos * precio,
      "match": "EXACTO | APROXIMADO | NUEVO",
      "nota": "descripción adicional o null"
    }
  ],
  "totalBoletos": suma de todos los vendidos,
  "totalUsd": suma de todos los totales
}`

  const contentBlock = mimeType === 'application/pdf'
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
    : { type: 'image',    source: { type: 'base64', media_type: mimeType, data: base64 } }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
      'content-type':      'application/json',
    },
    body: JSON.stringify({
      model:      'claude-opus-4-5',
      max_tokens: 2048,
      system:     systemPrompt,
      messages:   [{ role: 'user', content: [contentBlock, { type: 'text', text: 'Analiza este reporte de ventas de boletos y extrae los datos agrupados por precio según las instrucciones.' }] }],
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
    return NextResponse.json(parsed)
  } catch {
    return NextResponse.json({ error: 'Claude no devolvió JSON válido', raw: text }, { status: 422 })
  }
}

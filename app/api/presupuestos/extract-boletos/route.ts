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
Tu tarea es analizar un reporte de ventas de boletos y calcular el ingreso REAL total por zona, consolidando todos los sub-tipos de precio dentro de cada zona.

ZONAS DEL PRESUPUESTO (para hacer match por nombre o precio):
${zonasDesc || '(No hay zonas definidas en el presupuesto — usa los nombres del reporte)'}

INSTRUCCIONES — sigue este orden exacto:

PASO 1 — Identifica todas las ZONAS del reporte (columna más a la izquierda: RAWALAND 1, BINIKINI 2, FUNKY 1, etc.). Cada zona es un grupo.

PASO 2 — Dentro de cada zona, suma TODOS los sub-tipos de boletos (Regular, BAC, Diplomático, SENADYS, Promotor, etc.):
  - Suma los boletos vendidos con precio > $0 → este es el campo "vendidos"
  - Suma el monto total de esos boletos → este es el campo "totalUsd"
  - IGNORA las filas con precio $0 (Cortesía, complementarios) — no las incluyas en vendidos ni en totalUsd
  - Precio efectivo = totalUsd / vendidos (promedio ponderado, redondeado a 2 decimales)

PASO 3 — Si dentro de una zona hay un sub-tipo con precio MUY diferente al resto (más del 30% de diferencia, ej: SENADYS $85 dentro de una zona $170), crea una fila separada para ese sub-tipo usando el nombre "Zona — SubTipo" (ej: "RAWALAND 2 — SENADYS").

PASO 4 — Intenta hacer match entre cada zona del reporte y las zonas del presupuesto:
  - "EXACTO" si el precio promedio coincide exactamente
  - "APROXIMADO" si el nombre o precio es similar
  - "NUEVO" si no hay match — usa el nombre del reporte como zona

PASO 5 — Usa el nombre de la zona del PRESUPUESTO si hay match, si no usa el nombre del reporte.

Retorna SOLO el JSON, sin texto adicional ni backticks:
{
  "zonas": [
    {
      "zona": "nombre de la zona (del presupuesto si hay match, si no del reporte)",
      "vendidos": número total de boletos pagados en esta zona (excluye $0),
      "precio": precio promedio ponderado en USD,
      "totalUsd": ingreso total real de esta zona,
      "match": "EXACTO | APROXIMADO | NUEVO",
      "nota": "detalle de cómo se consolidó — ej: RAWALAND 2: Regular(105×$170) + BAC(174×$170) + Diplomático(34×$170) = 313 tickets"
    }
  ],
  "totalBoletos": suma de todos los vendidos,
  "totalUsd": suma de todos los totalUsd
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
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
    const jsonStr   = jsonMatch ? jsonMatch[1].trim() : text.trim()
    const parsed    = JSON.parse(jsonStr)
    return NextResponse.json(parsed)
  } catch {
    try {
      const start = text.indexOf('{')
      const end   = text.lastIndexOf('}')
      if (start !== -1 && end !== -1) {
        const parsed = JSON.parse(text.slice(start, end + 1))
        return NextResponse.json(parsed)
      }
    } catch { /* continúa */ }
    return NextResponse.json({ error: 'Claude no devolvió JSON válido', raw: text }, { status: 422 })
  }
}


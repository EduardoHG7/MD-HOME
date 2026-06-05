export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import * as XLSX from 'xlsx'

const SYSTEM_PROMPT = `Eres un experto en análisis de presupuestos de eventos de entretenimiento (conciertos, festivales, shows).
Tu tarea es analizar un documento de presupuesto de evento y extraer toda la información estructurada.

Responde ÚNICAMENTE con un objeto JSON válido (sin backticks, sin texto extra) con esta estructura exacta:

{
  "header": {
    "artista": "nombre del artista o null",
    "pais": "país o null",
    "ciudad": "ciudad o null",
    "promotor": "promotor o null",
    "moneda": "código de moneda local ej: PAB, COP, MXN, o USD",
    "exchangeRate": número o 1,
    "numShows": número o 1
  },
  "artistGuarantee": número o 0,
  "categorias": [
    {
      "nombre": "NOMBRE CATEGORÍA EN MAYÚSCULAS",
      "lineas": [
        {
          "descripcion": "descripción del ítem",
          "nota": "nota adicional o null",
          "montoLocal": número,
          "montoUsd": número,
          "confianza": "HIGH o LOW"
        }
      ]
    }
  ],
  "ticketZonas": [
    {
      "scaling": "código o null",
      "zona": "nombre de la zona",
      "capacity": número,
      "killsBlocks": número o 0,
      "comps": número o 0,
      "ticketPriceLocal": número,
      "ticketPriceUsd": número
    }
  ],
  "patrocinios": []
}

Reglas importantes:
- Artist Guarantee puede aparecer como "Artist Offer", "Artist Fee", "Total Artist Guarantee", "Guarantee" — detéctalo y ponlo en artistGuarantee
- NO incluyas el artist guarantee dentro de las categorías de costos
- NO dupliques subtotales como líneas de detalle — si hay un subtotal de categoría, úsalo como total implícito de las líneas
- Detecta ticket scaling aunque esté a la derecha del presupuesto o en una hoja separada
- Marca con confianza "LOW" los campos que no estés seguro
- Si un monto está en moneda local y hay exchange rate, calcula el USD
- Las categorías comunes son: ADVERTISING, TALENT, PRODUCTION, VENUE, OTHERS, VARIABLE EXPENSES — pero detecta cualquier otra
- Si no encuentras algún campo, usa null o 0 según corresponda`

function excelToText(buffer: Buffer): string {
  const workbook = XLSX.read(buffer, { type: 'buffer' })
  const parts: string[] = []

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    const csv   = XLSX.utils.sheet_to_csv(sheet, { blankrows: false })
    if (csv.trim()) {
      parts.push(`=== HOJA: ${sheetName} ===\n${csv}`)
    }
  }

  return parts.join('\n\n')
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'API key de Claude no configurada' }, { status: 500 })

  const { base64, mimeType, fileName } = await req.json()
  if (!base64 || !mimeType) return NextResponse.json({ error: 'Faltan datos del archivo' }, { status: 400 })

  const isPdf    = mimeType === 'application/pdf'
  const isExcel  = mimeType.includes('spreadsheet') || mimeType.includes('excel') ||
                   fileName?.toLowerCase().endsWith('.xlsx') || fileName?.toLowerCase().endsWith('.xls')
  const isImage  = mimeType.startsWith('image/')

  let messages: object[]

  if (isPdf) {
    messages = [{
      role: 'user',
      content: [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
        { type: 'text', text: 'Analiza este presupuesto de evento y extrae toda la información en el formato JSON especificado.' },
      ],
    }]
  } else if (isImage) {
    messages = [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } },
        { type: 'text', text: 'Analiza este presupuesto de evento y extrae toda la información en el formato JSON especificado.' },
      ],
    }]
  } else if (isExcel) {
    // Convertir Excel a texto CSV usando xlsx
    const buffer  = Buffer.from(base64, 'base64')
    const excelText = excelToText(buffer)
    messages = [{
      role: 'user',
      content: [
        { type: 'text', text: `Analiza este presupuesto de evento en formato Excel (convertido a CSV) y extrae toda la información en el formato JSON especificado.\n\nContenido del archivo "${fileName}":\n\n${excelText}` },
      ],
    }]
  } else {
    return NextResponse.json({ error: 'Formato no soportado. Usa PDF, imagen o Excel (.xlsx/.xls)' }, { status: 400 })
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
      'content-type':      'application/json',
    },
    body: JSON.stringify({
      model:      'claude-opus-4-5',
      max_tokens: 4096,
      system:     SYSTEM_PROMPT,
      messages,
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    return NextResponse.json({ error: `Error de Claude: ${err}` }, { status: 500 })
  }

  const result = await response.json()
  const text   = result.content?.[0]?.text ?? ''

  try {
    // Extraer JSON aunque venga envuelto en backticks de markdown
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
    const jsonStr   = jsonMatch ? jsonMatch[1].trim() : text.trim()
    const parsed    = JSON.parse(jsonStr)
    return NextResponse.json(parsed)
  } catch {
    // Intento secundario: buscar el primer { hasta el último }
    try {
      const start = text.indexOf('{')
      const end   = text.lastIndexOf('}')
      if (start !== -1 && end !== -1) {
        const parsed = JSON.parse(text.slice(start, end + 1))
        return NextResponse.json(parsed)
      }
    } catch { /* continúa al error */ }
    return NextResponse.json({ error: 'Claude no devolvió JSON válido', raw: text }, { status: 422 })
  }
}


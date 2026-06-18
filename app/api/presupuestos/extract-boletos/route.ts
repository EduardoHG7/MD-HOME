export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

interface FilaCruda {
  zona: string
  tipo: string
  precio: number
  vendidos: number
  total: number
}

interface ZonaPresupuesto {
  zona: string
  ticketPriceUsd: number
}

interface ZonaConsolidada {
  zona: string
  vendidos: number
  precio: number
  totalUsd: number
  match: string
  nota: string
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'API key de Claude no configurada' }, { status: 500 })

  const { base64, mimeType, zonasPresupuesto } = await req.json()
  if (!base64 || !mimeType) return NextResponse.json({ error: 'Faltan datos' }, { status: 400 })

  // Claude solo extrae filas crudas — el backend hace toda la matemática
  const systemPrompt = `Eres un extractor de datos de reportes de ventas de boletos.
Tu ÚNICA tarea es leer cada fila del reporte y transcribirla exactamente. NO hagas cálculos ni agrupes — solo lee y transcribe.

Para cada fila visible en el reporte extrae:
- zona: el nombre de la categoría/zona (columna izquierda). Si la celda está vacía, repite el nombre de la zona anterior.
- tipo: el tipo de boleto (Regular, BAC, Cortesía, Diplomático, SENADYS, Promotor, etc.)
- precio: el precio unitario exacto como número (0 si es cortesía o gratis)
- vendidos: la cantidad vendida como número entero
- total: el monto total de esa fila como número (exactamente como aparece en el documento)

IMPORTANTE:
- Copia los números EXACTAMENTE como aparecen en el documento — no redondees ni calcules
- Incluye TODAS las filas, incluyendo las de precio $0
- Si una fila no tiene datos legibles, ponlos en 0

Retorna SOLO el JSON, sin texto adicional ni backticks:
{ "filas": [ { "zona": "RAWALAND 1", "tipo": "Precio Regular", "precio": 185.00, "vendidos": 17, "total": 3145.00 } ] }`

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
      max_tokens: 4096,
      system:     systemPrompt,
      messages:   [{ role: 'user', content: [contentBlock, { type: 'text', text: 'Extrae todas las filas de este reporte de ventas de boletos exactamente como aparecen.' }] }],
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    return NextResponse.json({ error: `Error de Claude: ${err}` }, { status: 500 })
  }

  const result = await response.json()
  const text   = result.content?.[0]?.text ?? ''

  let filas: FilaCruda[] = []
  try {
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
    const jsonStr   = jsonMatch ? jsonMatch[1].trim() : text.trim()
    const parsed    = JSON.parse(jsonStr)
    filas = parsed.filas ?? []
  } catch {
    try {
      const start = text.indexOf('{')
      const end   = text.lastIndexOf('}')
      if (start !== -1 && end !== -1) {
        const parsed = JSON.parse(text.slice(start, end + 1))
        filas = parsed.filas ?? []
      }
    } catch { /* continúa */ }
    if (!filas.length) {
      return NextResponse.json({ error: 'Claude no devolvió JSON válido', raw: text }, { status: 422 })
    }
  }

  // ── Consolidación en el backend (matemática exacta) ──────────────────────

  // Agrupar filas por zona
  const porZona: Record<string, FilaCruda[]> = {}
  for (const f of filas) {
    const key = (f.zona ?? '').trim()
    if (!key) continue
    if (!porZona[key]) porZona[key] = []
    porZona[key].push(f)
  }

  const zonas: ZonaConsolidada[] = []

  for (const [nombreZona, filaZona] of Object.entries(porZona)) {
    // Separar filas con precio > 0 (ingresos reales) de las de $0 (cortesía)
    const filasConPrecio = filaZona.filter(f => f.precio > 0)
    if (!filasConPrecio.length) continue

    // Detectar si hay sub-tipos con precio muy diferente (>30%) dentro de la misma zona
    const precios = filasConPrecio.map(f => f.precio)
    const precioMax = Math.max(...precios)
    const precioMin = Math.min(...precios)
    const hayPreciosMuyDiferentes = precioMin < precioMax * 0.7

    if (hayPreciosMuyDiferentes) {
      // Agrupar por precio dentro de la zona
      const porPrecio: Record<number, FilaCruda[]> = {}
      for (const f of filasConPrecio) {
        if (!porPrecio[f.precio]) porPrecio[f.precio] = []
        porPrecio[f.precio].push(f)
      }
      for (const [precioStr, filasPrecio] of Object.entries(porPrecio)) {
        const precio    = parseFloat(precioStr)
        const vendidos  = filasPrecio.reduce((s, f) => s + f.vendidos, 0)
        const totalUsd  = filasPrecio.reduce((s, f) => s + f.total, 0)
        const tiposDesc = filasPrecio.map(f => `${f.tipo}(${f.vendidos})`).join('+')
        const subNombre = precio === precioMax ? nombreZona : `${nombreZona} — $${precio}`
        zonas.push({
          zona:     subNombre,
          vendidos,
          precio,
          totalUsd: Math.round(totalUsd * 100) / 100,
          match:    matchZona(subNombre, precio, zonasPresupuesto ?? []),
          nota:     `${nombreZona}: ${tiposDesc} × $${precio}`,
        })
      }
    } else {
      // Todos los sub-tipos tienen precio similar — consolidar en una sola fila
      const vendidos = filasConPrecio.reduce((s, f) => s + f.vendidos, 0)
      const totalUsd = filasConPrecio.reduce((s, f) => s + f.total, 0)
      const precioEfectivo = vendidos > 0 ? Math.round((totalUsd / vendidos) * 100) / 100 : precioMax
      const tiposDesc = filasConPrecio.map(f => `${f.tipo}(${f.vendidos}×$${f.precio})`).join(' + ')
      zonas.push({
        zona:     nombreZona,
        vendidos,
        precio:   precioEfectivo,
        totalUsd: Math.round(totalUsd * 100) / 100,
        match:    matchZona(nombreZona, precioEfectivo, zonasPresupuesto ?? []),
        nota:     tiposDesc,
      })
    }
  }

  const totalBoletos = zonas.reduce((s, z) => s + z.vendidos, 0)
  const totalUsd     = Math.round(zonas.reduce((s, z) => s + z.totalUsd, 0) * 100) / 100

  return NextResponse.json({ zonas, totalBoletos, totalUsd })
}

// Match zona del reporte con zona del presupuesto por nombre o precio
function matchZona(nombre: string, precio: number, zonasPresupuesto: ZonaPresupuesto[]): string {
  if (!zonasPresupuesto.length) return 'NUEVO'
  for (const z of zonasPresupuesto) {
    if (z.zona.toLowerCase() === nombre.toLowerCase()) return 'EXACTO'
    if (Math.abs(z.ticketPriceUsd - precio) < 0.01) return 'EXACTO'
  }
  for (const z of zonasPresupuesto) {
    const diff = Math.abs(z.ticketPriceUsd - precio) / Math.max(z.ticketPriceUsd, precio)
    if (diff < 0.15) return 'APROXIMADO'
    if (nombre.toLowerCase().includes(z.zona.toLowerCase()) || z.zona.toLowerCase().includes(nombre.toLowerCase())) return 'APROXIMADO'
  }
  return 'NUEVO'
}

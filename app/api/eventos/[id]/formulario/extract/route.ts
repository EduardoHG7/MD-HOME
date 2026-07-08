export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { downloadFromSharePoint } from '@/lib/sharepoint'

const SYSTEM_PROMPT = `Eres un asistente que llena formularios fiscales de Panamá para facturación electrónica.
Recibirás el aviso de operaciones de una empresa y/o la cédula de su representante legal.
Extrae los datos fiscales y responde ÚNICAMENTE con un objeto JSON válido (sin backticks, sin texto extra) con esta estructura exacta:

{
  "razonSocial": "razón social o nombre completo del contribuyente, o null",
  "nombreComercial": "nombre comercial del negocio, o null",
  "rucDv": "RUC con su DV, ej: 8-905-966 DV43, o null",
  "direccion": "dirección completa, o null",
  "provincia": "provincia, o null",
  "distrito": "distrito, o null",
  "corregimiento": "corregimiento, o null",
  "telefonos": "teléfonos, o null",
  "organizacion": "JURIDICA o NATURAL según el tipo de contribuyente, o null"
}

Reglas:
- Si el contribuyente es una persona natural, la razón social es su nombre completo y el RUC suele ser su cédula con DV
- Escribe provincia, distrito y corregimiento en MAYÚSCULAS
- Si un dato no aparece en los documentos, usa null`

function mimeDe(nombre: string): string | null {
  const ext = nombre.toLowerCase().split('.').pop()
  if (ext === 'pdf') return 'application/pdf'
  if (ext === 'png') return 'image/png'
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
  if (ext === 'webp') return 'image/webp'
  return null
}

// Llena el formulario con IA leyendo el aviso de operaciones y la cédula ya subidos al evento
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role === 'APLICANTE') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'API key de Claude no configurada' }, { status: 500 })

  const docs = await prisma.eventoDocumento.findMany({
    where: { eventoId: params.id, tipo: { in: ['AVISO_OPERACIONES', 'CEDULA_REP_LEGAL'] } },
    orderBy: { createdAt: 'desc' },
  })

  // Usar el más reciente de cada tipo
  const fuentes = ['AVISO_OPERACIONES', 'CEDULA_REP_LEGAL']
    .map(tipo => docs.find(d => d.tipo === tipo))
    .filter((d): d is NonNullable<typeof d> => Boolean(d))

  if (fuentes.length === 0) {
    return NextResponse.json(
      { error: 'Sube primero el aviso de operaciones y/o la cédula del representante legal' },
      { status: 400 }
    )
  }

  const content: object[] = []
  for (const doc of fuentes) {
    const mime = mimeDe(doc.archivoNombre)
    if (!mime) continue // Word u otros formatos no se pueden enviar a Claude
    const { buffer } = await downloadFromSharePoint(doc.archivoPath)
    const base64 = Buffer.from(buffer).toString('base64')
    content.push(
      mime === 'application/pdf'
        ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
        : { type: 'image', source: { type: 'base64', media_type: mime, data: base64 } }
    )
  }

  if (content.length === 0) {
    return NextResponse.json(
      { error: 'Los documentos subidos deben ser PDF o imagen para poder leerlos con IA' },
      { status: 400 }
    )
  }

  content.push({ type: 'text', text: 'Extrae los datos fiscales de estos documentos en el formato JSON especificado.' })

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
      'content-type':      'application/json',
    },
    body: JSON.stringify({
      model:      'claude-opus-4-8',
      max_tokens: 2048,
      system:     SYSTEM_PROMPT,
      messages:   [{ role: 'user', content }],
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    return NextResponse.json({ error: `Error de Claude: ${err}` }, { status: 500 })
  }

  const result = await response.json()
  const text   = result.content?.find((b: { type: string }) => b.type === 'text')?.text ?? ''

  try {
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
    const jsonStr   = jsonMatch ? jsonMatch[1].trim() : text.trim()
    return NextResponse.json(JSON.parse(jsonStr))
  } catch {
    try {
      const start = text.indexOf('{')
      const end   = text.lastIndexOf('}')
      if (start !== -1 && end !== -1) {
        return NextResponse.json(JSON.parse(text.slice(start, end + 1)))
      }
    } catch { /* continúa al error */ }
    return NextResponse.json({ error: 'Claude no devolvió JSON válido', raw: text }, { status: 422 })
  }
}

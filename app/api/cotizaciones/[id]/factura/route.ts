export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { uploadToSharePoint } from '@/lib/sharepoint'

// POST: usuario sube la factura real después de que fue aprobada
// La IA extrae los datos y se guardan en la cotización
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const cot = await prisma.cotizacion.findUnique({
    where: { id: params.id },
    select: { creadoPorId: true, estado: true, linea: { select: { descripcion: true } } },
  })

  if (!cot) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })
  if (cot.creadoPorId !== session.user.id && session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }
  if (cot.estado !== 'APROBADA') {
    return NextResponse.json({ error: 'Solo se puede subir factura a cotizaciones aprobadas' }, { status: 400 })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'API key de Claude no configurada' }, { status: 500 })

  const { base64, mimeType, fileName } = await req.json()
  if (!base64 || !mimeType) return NextResponse.json({ error: 'Faltan datos del archivo' }, { status: 400 })

  // 1. Subir a SharePoint
  const ext  = mimeType.split('/')[1]?.replace('jpeg', 'jpg') ?? 'pdf'
  const path = `Facturas/Cotizaciones/${params.id}/factura.${ext}`
  await uploadToSharePoint(path, Buffer.from(base64, 'base64'), mimeType)
  const facturaUrl = `/api/fotos?path=${encodeURIComponent(path)}`

  // 2. Extraer datos con Claude
  const systemPrompt = `Eres un extractor especializado de facturas.
Analiza esta factura y responde ÚNICAMENTE con un objeto JSON válido (sin backticks, sin texto extra):
{
  "numero_factura": "número o null",
  "proveedor": "nombre del proveedor o null",
  "fecha_emision": "DD/MM/YYYY o null",
  "fecha_pago": "DD/MM/YYYY o null",
  "subtotal": número o 0,
  "itbms": número o 0,
  "total": número o 0
}`

  const isPdf = mimeType === 'application/pdf'
  const contentBlock = isPdf
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
    : { type: 'image',    source: { type: 'base64', media_type: mimeType,            data: base64 } }

  const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-opus-4-5', max_tokens: 1024, system: systemPrompt,
      messages: [{ role: 'user', content: [contentBlock, { type: 'text', text: 'Extrae los datos de esta factura.' }] }],
    }),
  })

  let extracted: Record<string, string | number | null> = {}
  if (aiRes.ok) {
    const aiData = await aiRes.json()
    try { extracted = JSON.parse(aiData.content?.[0]?.text ?? '{}') } catch { /* ignore */ }
  }

  // 3. Guardar en la cotización
  const updated = await prisma.cotizacion.update({
    where: { id: params.id },
    data: {
      facturaUrl,
      facturaSubida:      true,
      facturaNumero:      extracted.numero_factura  as string ?? null,
      facturaProveedor:   extracted.proveedor       as string ?? null,
      facturaFechaEmision: extracted.fecha_emision  as string ?? null,
      facturaFechaPago:   extracted.fecha_pago      as string ?? null,
      facturaSubtotal:    Number(extracted.subtotal) || 0,
      facturaItbms:       Number(extracted.itbms)   || 0,
      facturaTotal:       Number(extracted.total)   || 0,
    },
    include: { facturas: true, creadoPor: { select: { name: true, email: true } } },
  })

  return NextResponse.json({ cotizacion: updated, extracted })
}

// PATCH: guardar datos editados de la factura (después de revisión manual)
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const data = await req.json()
  const updated = await prisma.cotizacion.update({
    where: { id: params.id },
    data: {
      facturaNumero:      data.facturaNumero      ?? null,
      facturaProveedor:   data.facturaProveedor   ?? null,
      facturaFechaEmision: data.facturaFechaEmision ?? null,
      facturaFechaPago:   data.facturaFechaPago   ?? null,
      facturaSubtotal:    Number(data.facturaSubtotal) || 0,
      facturaItbms:       Number(data.facturaItbms)    || 0,
      facturaTotal:       Number(data.facturaTotal)    || 0,
    },
  })
  return NextResponse.json(updated)
}

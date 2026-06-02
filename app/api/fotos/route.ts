export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { downloadFromSharePoint } from '@/lib/sharepoint'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const path = searchParams.get('path')

  if (!path) {
    return NextResponse.json({ error: 'Falta el parámetro path' }, { status: 400 })
  }

  // Prevenir path traversal
  if (path.includes('..') || path.startsWith('/')) {
    return NextResponse.json({ error: 'Ruta inválida' }, { status: 400 })
  }

  try {
    const { buffer, contentType } = await downloadFromSharePoint(path)
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'private, max-age=3600',
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error al obtener la imagen'
    return NextResponse.json({ error: msg }, { status: 404 })
  }
}

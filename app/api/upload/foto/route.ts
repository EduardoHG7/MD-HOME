export const dynamic = 'force-dynamic'
export const maxDuration = 30

import { NextResponse } from 'next/server'
import { uploadToSharePoint } from '@/lib/sharepoint'

// Tipos de foto permitidos
const TIPOS_VALIDOS = ['fotoPersonal', 'fotoCedula', 'fotoConCedula'] as const
type TipoFoto = typeof TIPOS_VALIDOS[number]

export async function POST(req: Request) {
  const { base64, mimeType, cedula, tipo } = await req.json()

  if (!base64 || !mimeType || !cedula || !tipo) {
    return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 })
  }

  if (!TIPOS_VALIDOS.includes(tipo as TipoFoto)) {
    return NextResponse.json({ error: 'Tipo de foto inválido' }, { status: 400 })
  }

  const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic']
  if (!allowedMimes.includes(mimeType)) {
    return NextResponse.json({ error: 'Formato no permitido' }, { status: 400 })
  }

  try {
    const buffer   = Buffer.from(base64, 'base64')
    const ext      = mimeType.split('/')[1].replace('jpeg', 'jpg')
    const filename = `${tipo}.${ext}`
    const path     = `AplicanteFotos/${cedula}/${filename}`

    await uploadToSharePoint(path, buffer, mimeType)
    // Devolver URL del proxy interno (no expira, sirve la imagen con token fresco)
    const url = `/api/fotos?path=${encodeURIComponent(path)}`
    return NextResponse.json({ url })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error al subir foto'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

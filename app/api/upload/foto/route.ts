export const dynamic = 'force-dynamic'
export const maxDuration = 30

import { NextResponse } from 'next/server'
import { uploadToSharePoint } from '@/lib/sharepoint'

// Tipos de foto permitidos
const TIPOS_VALIDOS = ['fotoPersonal', 'fotoCedula', 'fotoConCedula'] as const
type TipoFoto = typeof TIPOS_VALIDOS[number]

// SharePoint rechaza items cuyo nombre difiere de uno existente solo en
// espacios/puntos al final ("nameAlreadyExists" / "incompatible with a
// similar name on an existing item"). La cédula se usa como nombre de
// carpeta, así que hay que normalizarla antes de armar la ruta: de lo
// contrario un espacio de más (típico del teclado predictivo del celular)
// o un caracter inválido hace que la carpeta "nueva" choque con la carpeta
// ya creada en un intento anterior con la misma cédula.
function sanitizarCedula(cedula: string): string {
  const normalizada = cedula.normalize('NFKC').trim().replace(/\s+/g, ' ')
  const sinInvalidos = normalizada.replace(/["*:<>?/\\|]/g, '-')
  return sinInvalidos.replace(/[.\s]+$/, '')
}

export async function POST(req: Request) {
  const { base64, mimeType, cedula, tipo } = await req.json()

  if (!base64 || !mimeType || !cedula || !tipo) {
    return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 })
  }

  const cedulaSegura = sanitizarCedula(cedula)
  if (!cedulaSegura) {
    return NextResponse.json({ error: 'Cédula inválida' }, { status: 400 })
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
    const path     = `AplicanteFotos/${cedulaSegura}/${filename}`

    await uploadToSharePoint(path, buffer, mimeType)
    // Devolver URL del proxy interno (no expira, sirve la imagen con token fresco)
    const url = `/api/fotos?path=${encodeURIComponent(path)}`
    return NextResponse.json({ url })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error al subir foto'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

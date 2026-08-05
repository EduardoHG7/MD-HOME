export const dynamic = 'force-dynamic'

import fs from 'fs'
import path from 'path'
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { uploadToSharePoint } from '@/lib/sharepoint'

// Endpoint de un solo uso: repara el adjunto de la cotización de Farruko que
// quedó corrupto por el bug de detección de extensión (ver commit cd343b4).
// Se borra después de usarse.
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Solo admins' }, { status: 403 })
  }

  const cot = await prisma.cotizacion.findFirst({
    where: { archivoNombreCot: { contains: 'FARRUKO', mode: 'insensitive' } },
    select: { id: true, archivoNombreCot: true },
  })
  if (!cot) {
    return NextResponse.json({ error: 'No se encontró la cotización de Farruko' }, { status: 404 })
  }

  const fileName = 'VISAS Y PERMISOS FARRUKO.xlsx'
  const buffer = fs.readFileSync(path.join(process.cwd(), 'tmp-fix', 'farruko.xlsx'))
  const mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

  const uploadPath = `Cotizaciones/${cot.id}/cotizacion.xlsx`
  await uploadToSharePoint(uploadPath, buffer, mimeType)
  const archivoUrl = `/api/fotos?path=${encodeURIComponent(uploadPath)}`

  await prisma.cotizacion.update({
    where: { id: cot.id },
    data: { archivoUrl, archivoNombreCot: fileName },
  })

  return NextResponse.json({ ok: true, cotizacionId: cot.id, archivoUrl, archivoAnterior: cot.archivoNombreCot })
}

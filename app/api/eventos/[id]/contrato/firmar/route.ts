export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { uploadToSharePoint, downloadFromSharePoint } from '@/lib/sharepoint'
import { notificarPorRol } from '@/lib/notificaciones'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

// El admin (gerente general) firma el contrato: se estampa su firma en el PDF
// y se notifica a operaciones y contabilidad.
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Solo el administrador puede firmar contratos' }, { status: 403 })
  }

  const contrato = await prisma.eventoContrato.findUnique({
    where: { eventoId: params.id },
    include: { evento: { select: { nombre: true } } },
  })
  if (!contrato) return NextResponse.json({ error: 'Este evento no tiene contrato subido' }, { status: 404 })
  if (contrato.estado === 'FIRMADO') {
    return NextResponse.json({ error: 'El contrato ya está firmado' }, { status: 400 })
  }

  const firmante = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { name: true, email: true, firmaImagen: true },
  })
  if (!firmante?.firmaImagen) {
    return NextResponse.json(
      { error: 'Primero registra tu firma en la sección "Mi firma"' },
      { status: 400 }
    )
  }

  try {
    const { buffer } = await downloadFromSharePoint(contrato.archivoPath)
    const pdf  = await PDFDocument.load(buffer)
    const font = await pdf.embedFont(StandardFonts.Helvetica)

    // firmaImagen es un data URL: data:image/png;base64,...
    const [meta, firmaBase64] = firmante.firmaImagen.split(',')
    const firmaBytes = Buffer.from(firmaBase64, 'base64')
    const firmaImg   = meta.includes('image/jpeg') || meta.includes('image/jpg')
      ? await pdf.embedJpg(firmaBytes)
      : await pdf.embedPng(firmaBytes)

    // Estampar en la esquina inferior derecha de la última página
    const page   = pdf.getPage(pdf.getPageCount() - 1)
    const ancho  = 150
    const alto   = (firmaImg.height / firmaImg.width) * ancho
    const x      = page.getWidth() - ancho - 60
    const fecha  = new Date().toLocaleString('es-PA', { dateStyle: 'long', timeStyle: 'short' })

    page.drawImage(firmaImg, { x, y: 80, width: ancho, height: alto })
    page.drawLine({
      start: { x, y: 76 }, end: { x: x + ancho, y: 76 },
      thickness: 0.8, color: rgb(0.2, 0.2, 0.2),
    })
    page.drawText(firmante.name ?? firmante.email, { x, y: 64, size: 9, font, color: rgb(0.15, 0.15, 0.15) })
    page.drawText('Gerente General - Panatickets, S.A.', { x, y: 52, size: 8, font, color: rgb(0.35, 0.35, 0.35) })
    page.drawText(`Firmado: ${fecha}`, { x, y: 41, size: 8, font, color: rgb(0.35, 0.35, 0.35) })

    const firmadoBytes = Buffer.from(await pdf.save())
    const firmadoPath  = contrato.archivoPath.replace(/\.pdf$/i, '') + '-FIRMADO.pdf'
    await uploadToSharePoint(firmadoPath, firmadoBytes, 'application/pdf')

    const actualizado = await prisma.eventoContrato.update({
      where: { eventoId: params.id },
      data: {
        firmadoPath,
        estado:       'FIRMADO',
        firmadoPorId: session.user.id,
        firmadoAt:    new Date(),
      },
      include: {
        subidoPor:  { select: { name: true, email: true } },
        firmadoPor: { select: { name: true, email: true } },
      },
    })

    // Operaciones y contabilidad no tienen acceso a /admin: se les manda el PDF directo
    const appUrl = process.env.NEXTAUTH_URL ?? ''
    notificarPorRol(
      ['OPERACIONES', 'CONTABILIDAD'],
      `✅ *Contrato firmado*\n\nEvento: ${contrato.evento.nombre}\nFirmado por: ${firmante.name ?? firmante.email}\n\nVer contrato: ${appUrl}/api/fotos?path=${encodeURIComponent(firmadoPath)}`
    )

    return NextResponse.json(actualizado)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error al firmar el contrato'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

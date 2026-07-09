export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { uploadToSharePoint, downloadFromSharePoint } from '@/lib/sharepoint'
import { notificarPorRol } from '@/lib/notificaciones'
import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib'

// Posición del bloque de firma elegida con clic en el visor.
// pagina: índice 0-based; xRatio/yRatio: 0..1 medidos desde la esquina superior
// izquierda de esa página tal como se ve en el visor (el punto = centro de la firma).
interface Colocacion {
  pagina: number
  xRatio: number
  yRatio: number
}

// El admin (gerente general) firma el contrato: se estampa su firma en el bloque
// que eligió con clic y una rúbrica en el margen de cada página; luego se notifica
// a operaciones y contabilidad.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Solo el administrador puede firmar contratos' }, { status: 403 })
  }

  // El cuerpo es opcional: si no llega colocación, se usa la posición por defecto
  // (bloque abajo-derecha de la última página).
  let colocacion: Colocacion | null = null
  try {
    const body = await req.json()
    if (body && typeof body.pagina === 'number' &&
        typeof body.xRatio === 'number' && typeof body.yRatio === 'number') {
      colocacion = body as Colocacion
    }
  } catch { /* sin cuerpo → posición por defecto */ }

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

    const pages   = pdf.getPages()
    const aspecto = firmaImg.height / firmaImg.width   // alto / ancho
    const fecha   = new Date().toLocaleString('es-PA', { dateStyle: 'long', timeStyle: 'short' })
    const nombre  = firmante.name ?? firmante.email

    // 1) Bloque de firma: donde el gerente hizo clic, o abajo-derecha de la última
    //    página si no se envió colocación. El punto del clic = centro de la firma.
    const anchoBloque = 150
    const altoBloque  = aspecto * anchoBloque

    let pageBloque = pages[pages.length - 1]
    let x: number, y: number
    if (colocacion && pages[colocacion.pagina]) {
      pageBloque = pages[colocacion.pagina]
      x = colocacion.xRatio * pageBloque.getWidth()  - anchoBloque / 2
      // yRatio viene desde arriba; pdf-lib mide desde abajo → invertir
      y = (1 - colocacion.yRatio) * pageBloque.getHeight() - altoBloque / 2
    } else {
      x = pageBloque.getWidth() - anchoBloque - 60
      y = 80
    }
    // Mantener el bloque dentro de la página (deja aire para el texto de abajo)
    x = Math.max(20, Math.min(x, pageBloque.getWidth()  - anchoBloque - 20))
    y = Math.max(40, Math.min(y, pageBloque.getHeight() - altoBloque - 20))

    pageBloque.drawImage(firmaImg, { x, y, width: anchoBloque, height: altoBloque })
    pageBloque.drawLine({
      start: { x, y: y - 4 }, end: { x: x + anchoBloque, y: y - 4 },
      thickness: 0.8, color: rgb(0.2, 0.2, 0.2),
    })
    pageBloque.drawText(nombre, { x, y: y - 16, size: 9, font, color: rgb(0.15, 0.15, 0.15) })
    pageBloque.drawText('Gerente General - Panatickets, S.A.', { x, y: y - 28, size: 8, font, color: rgb(0.35, 0.35, 0.35) })
    pageBloque.drawText(`Firmado: ${fecha}`, { x, y: y - 39, size: 8, font, color: rgb(0.35, 0.35, 0.35) })

    // 2) Rúbrica en el margen derecho de CADA página (rotada 90° CCW, centrada
    //    verticalmente). Tras rotar 90°, la imagen de ancho w × alto h dibujada en
    //    el ancla (rx, ry) ocupa: horizontal [rx - h, rx], vertical [ry, ry + w].
    const anchoRub = 64
    const altoRub  = aspecto * anchoRub
    for (const page of pages) {
      const rx = page.getWidth() - 6            // borde derecho de la rúbrica ≈ margen
      const ry = page.getHeight() / 2 - anchoRub / 2  // centrada en vertical
      page.drawImage(firmaImg, {
        x: rx, y: ry, width: anchoRub, height: altoRub, rotate: degrees(90),
      })
    }

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

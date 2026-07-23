export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { uploadToSharePoint, downloadFromSharePoint } from '@/lib/sharepoint'
import { sendMail, templateContratoFirmado } from '@/lib/mail'
import { CONTRATO_FROM, CONTRATO_INFO } from '@/lib/contrato-notif'
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

    // Algunas páginas (p. ej. contratos escaneados) traen un /Rotate propio en
    // el PDF: el visor (y pdf.js en el navegador, donde el gerente hace clic)
    // lo respeta y muestra la página derecha, pero pdf-lib dibuja siempre en
    // el espacio de coordenadas "crudo" (sin rotar). Si no se compensa, todo
    // lo que dibujamos queda girado (se vio: firma y rúbrica invertidas en un
    // contrato con /Rotate=180). "vis" = coordenadas tal como se ven en el
    // visor (origen arriba-izquierda); "raw" = coordenadas de pdf-lib.
    const anguloPagina = (page: (typeof pages)[number]): 0 | 90 | 180 | 270 => {
      const a = ((page.getRotation().angle % 360) + 360) % 360
      return (a === 90 || a === 180 || a === 270) ? a : 0
    }
    // Punto (sin orientación propia, p. ej. extremos de una línea): de vis → raw.
    const puntoARaw = (page: (typeof pages)[number], visX: number, visY: number) => {
      const W = page.getWidth(), H = page.getHeight()
      switch (anguloPagina(page)) {
        case 90:  return { x: visY,       y: visX }
        case 180: return { x: W - visX,   y: visY }
        case 270: return { x: W - visY,   y: H - visX }
        default:  return { x: visX,       y: H - visY }
      }
    }
    // Ancla para contenido CON orientación propia (imagen/texto): coloca su
    // esquina superior-izquierda visual en (visX, visY) y devuelve también la
    // rotación que hay que aplicarle para que salga derecho ya renderizado.
    const anclaARaw = (page: (typeof pages)[number], visX: number, visY: number, altoLocal: number) => {
      const W = page.getWidth(), H = page.getHeight()
      const rot = anguloPagina(page)
      switch (rot) {
        case 90:  return { x: visY + altoLocal,     y: visX,           rotate: degrees(90) }
        case 180: return { x: W - visX,             y: visY + altoLocal, rotate: degrees(180) }
        case 270: return { x: W - visY - altoLocal, y: H - visX,        rotate: degrees(270) }
        default:  return { x: visX,                 y: H - visY - altoLocal, rotate: degrees(0) }
      }
    }

    // 1) Bloque de firma: donde el gerente hizo clic, o abajo-derecha de la última
    //    página si no se envió colocación. El punto del clic = centro de la firma.
    //    Todo se calcula en coordenadas visuales (como se ve en pantalla) y se
    //    convierte al final, así no importa si la página tiene rotación o no.
    const anchoBloque = 150
    const altoBloque  = aspecto * anchoBloque

    const pageBloque   = (colocacion && pages[colocacion.pagina]) ? pages[colocacion.pagina] : pages[pages.length - 1]
    const rotBloque    = anguloPagina(pageBloque)
    const visualAncho  = (rotBloque === 90 || rotBloque === 270) ? pageBloque.getHeight() : pageBloque.getWidth()
    const visualAlto   = (rotBloque === 90 || rotBloque === 270) ? pageBloque.getWidth()  : pageBloque.getHeight()
    let visX: number, visY: number
    if (colocacion && pages[colocacion.pagina]) {
      visX = colocacion.xRatio * visualAncho - anchoBloque / 2
      visY = colocacion.yRatio * visualAlto  - altoBloque  / 2
    } else {
      visX = visualAncho - anchoBloque - 60
      visY = visualAlto  - altoBloque  - 80
    }
    // Mantener el bloque dentro de la página (deja aire para el texto de abajo)
    visX = Math.max(20, Math.min(visX, visualAncho - anchoBloque - 20))
    visY = Math.max(20, Math.min(visY, visualAlto  - altoBloque  - 63))

    const anclaImg = anclaARaw(pageBloque, visX, visY, altoBloque)
    pageBloque.drawImage(firmaImg, { x: anclaImg.x, y: anclaImg.y, width: anchoBloque, height: altoBloque, rotate: anclaImg.rotate })

    const pLinea1 = puntoARaw(pageBloque, visX, visY + altoBloque + 4)
    const pLinea2 = puntoARaw(pageBloque, visX + anchoBloque, visY + altoBloque + 4)
    pageBloque.drawLine({ start: pLinea1, end: pLinea2, thickness: 0.8, color: rgb(0.2, 0.2, 0.2) })

    const textoBloque = (texto: string, offsetY: number, size: number, color: ReturnType<typeof rgb>) => {
      const p = puntoARaw(pageBloque, visX, visY + altoBloque + offsetY)
      pageBloque.drawText(texto, { x: p.x, y: p.y, size, font, color, rotate: degrees(rotBloque) })
    }
    textoBloque(nombre, 16, 9, rgb(0.15, 0.15, 0.15))
    textoBloque('Gerente General - Panatickets, S.A.', 28, 8, rgb(0.35, 0.35, 0.35))
    textoBloque(`Firmado: ${fecha}`, 39, 8, rgb(0.35, 0.35, 0.35))

    // 2) Rúbrica en el margen derecho VISUAL de CADA página (sideways, centrada
    //    verticalmente), compensando también la rotación propia de cada página.
    //    Posiciones obtenidas igualando el centro visual deseado del sello con
    //    su centro real tras rotarlo (ver derivación en el commit); no cambiar
    //    sin volver a verificar la geometría.
    const anchoRub = 64
    const altoRub  = aspecto * anchoRub
    for (const page of pages) {
      const rot = anguloPagina(page)
      const W = page.getWidth(), H = page.getHeight()
      let x: number, y: number, rotDeg: 0 | 90 | 180 | 270
      switch (rot) {
        case 90:  x = W / 2 + anchoRub / 2; y = H - 6;              rotDeg = 180; break
        case 180: x = 6;                    y = H / 2 + anchoRub / 2; rotDeg = 270; break
        case 270: x = W / 2 - anchoRub / 2; y = 6;                  rotDeg = 0;   break
        default:  x = W - 6;                y = H / 2 - anchoRub / 2; rotDeg = 90;  break
      }
      page.drawImage(firmaImg, { x, y, width: anchoRub, height: altoRub, rotate: degrees(rotDeg) })
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

    // Aviso por correo a quien lo subió y a info@panatickets.com de que se firmó
    const appUrl = process.env.NEXTAUTH_URL ?? ''
    const destinatarios = [actualizado.subidoPor?.email, CONTRATO_INFO].filter((x): x is string => Boolean(x))
    try {
      await sendMail({
        fromEmail: CONTRATO_FROM,
        toEmails:  destinatarios,
        subject:   `Contrato firmado — ${contrato.evento.nombre}`,
        html: templateContratoFirmado({
          eventoNombre: contrato.evento.nombre,
          firmante:     firmante.name ?? firmante.email ?? '—',
          url:          `${appUrl}/api/fotos?path=${encodeURIComponent(firmadoPath)}`,
        }),
      })
    } catch (e) {
      console.error('[contrato] Error enviando correo de contrato firmado:', e)
    }

    return NextResponse.json(actualizado)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error al firmar el contrato'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

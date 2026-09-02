import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import { Readable } from 'stream'
import { Prisma } from '@prisma/client'
import { downloadPanaticketsFinanzasExcel } from './panatickets-sharepoint'
import { prisma } from './prisma'

/**
 * El equipo edita este Excel a mano en vivo (filtros, tablas dinámicas,
 * slicers). exceljs no soporta ciertos nodos XML que Excel genera para
 * filtros de columna agrupados por fecha (<dateGroupItem>) y su parser
 * revienta con "Unexpected xml node in parseOpen" apenas alguien deja un
 * AutoFilter de fecha activo al guardar. Como no necesitamos el estado de
 * filtros/tablas dinámicas (leemos las celdas crudas), se les quita del
 * .xlsx antes de parsear — de paso el archivo pesa ~5-20MB menos porque los
 * cachés de tablas dinámicas no se necesitan para nada.
 */
const SHEETS_NECESARIAS = new Set(['Reporte Showare', 'Saldos Banco', 'Estatus evento', 'En transito'])

/**
 * Quita los nodos <autoFilter> de un XML de hoja/tabla operando SIEMPRE
 * sobre Buffer, nunca convirtiendo el archivo entero a string de JS.
 * "Reporte Showare" solo crece (nunca se depura) y ya es tan grande que
 * `.async('string')` + `.replace()` (la versión anterior) hacía que jszip
 * intentara construir una string de cientos de millones de caracteres para
 * convertir el buffer decodificado — `Array.prototype.join` de la propia
 * jszip reventaba con "RangeError: Invalid string length" bastante antes
 * de llegar al límite real de memoria disponible. Un Buffer no tiene ese
 * techo (~1GB de caracteres para un string), así que se buscan/cortan los
 * tags directamente en bytes (todos los delimitadores son ASCII de 1 byte,
 * así que es seguro hacerlo sin decodificar el UTF-8 del resto del XML).
 */
function quitarAutoFilterBuffer(buf: Buffer): Buffer {
  const openTag = Buffer.from('<autoFilter')
  const closeTag = Buffer.from('</autoFilter>')
  const partes: Buffer[] = []
  let cursor = 0
  for (;;) {
    const start = buf.indexOf(openTag, cursor)
    if (start === -1) {
      partes.push(buf.subarray(cursor))
      break
    }
    partes.push(buf.subarray(cursor, start))
    const gt = buf.indexOf(0x3e /* '>' */, start) // fin de la etiqueta de apertura
    if (gt === -1) {
      // XML truncado/malformado a partir de acá — no debería pasar nunca,
      // pero mejor conservar el resto tal cual que perder datos.
      partes.push(buf.subarray(start))
      break
    }
    const esAutocerrada = buf[gt - 1] === 0x2f /* '/' justo antes de '>' */
    if (esAutocerrada) {
      cursor = gt + 1
    } else {
      const closeIdx = buf.indexOf(closeTag, gt)
      cursor = closeIdx === -1 ? buf.length : closeIdx + closeTag.length
    }
  }
  return Buffer.concat(partes)
}

function logMemoria(etiqueta: string) {
  const m = process.memoryUsage()
  const mb = (n: number) => Math.round(n / 1024 / 1024)
  console.log(`[finanzas-panatickets] memoria @ ${etiqueta}: rss=${mb(m.rss)}MB heapUsed=${mb(m.heapUsed)}MB external=${mb(m.external)}MB arrayBuffers=${mb(m.arrayBuffers)}MB`)
}

async function sanitizeWorkbookBuffer(buffer: Buffer): Promise<Buffer> {
  logMemoria('inicio sanitize')
  const zip = await JSZip.loadAsync(buffer)
  const relsPath = 'xl/_rels/workbook.xml.rels'
  const wbPath = 'xl/workbook.xml'

  // Quitar del todo las hojas que no usamos (exports crudos por banco,
  // pivots, etc. — algunas tienen decenas de miles de filas que no hace
  // falta parsear). Sin esto exceljs procesa las 20+ hojas igual, aunque
  // no aparezcan referenciadas.
  const wbXml = await zip.file(wbPath)!.async('string')
  const sheetEls = wbXml.match(/<sheet\b[^>]*\/>/g) ?? []
  const rIdsAQuitar = new Set<string>()
  let newWbXml = wbXml
  for (const el of sheetEls) {
    const name = el.match(/name="([^"]*)"/)?.[1]
    const rid = el.match(/r:id="([^"]*)"/)?.[1]
    if (!name || !rid || SHEETS_NECESARIAS.has(name)) continue
    rIdsAQuitar.add(rid)
    newWbXml = newWbXml.replace(el, '')
  }
  newWbXml = newWbXml.replace(/<definedNames>[\s\S]*?<\/definedNames>/g, '')
  zip.file(wbPath, newWbXml)

  const relsXml = await zip.file(relsPath)!.async('string')
  const relEls = relsXml.match(/<Relationship\b[^>]*\/>/g) ?? []
  let newRelsXml = relsXml
  const hojasAQuitar: string[] = []
  for (const el of relEls) {
    const id = el.match(/Id="([^"]*)"/)?.[1]
    const target = el.match(/Target="([^"]*)"/)?.[1]
    if (!id || !target || !rIdsAQuitar.has(id)) continue
    newRelsXml = newRelsXml.replace(el, '')
    if (target.startsWith('worksheets/')) hojasAQuitar.push(target)
  }
  zip.file(relsPath, newRelsXml)

  const ctPath = '[Content_Types].xml'
  let ct = await zip.file(ctPath)!.async('string')
  for (const target of hojasAQuitar) {
    zip.remove(`xl/${target}`)
    zip.remove(`xl/worksheets/_rels/${target.split('/').pop()}.rels`)
    const esc = `/xl/${target}`.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    ct = ct.replace(new RegExp(`<Override PartName="${esc}"[^>]*/>`, 'g'), '')
  }
  zip.file(ctPath, ct)

  console.log(`[finanzas-panatickets] hojas encontradas en workbook.xml: ${sheetEls.length}, a quitar: ${hojasAQuitar.length} (${hojasAQuitar.join(', ') || 'ninguna'})`)
  logMemoria('tras quitar hojas no usadas')

  // calcChain.xml referencia celdas por hoja — puede quedar con referencias
  // colgantes a hojas que ya no existen, más fácil quitarlo entero (solo es
  // una optimización de orden de cálculo, no datos).
  if (zip.file('xl/calcChain.xml')) {
    zip.remove('xl/calcChain.xml')
    ct = ct.replace(/<Override PartName="\/xl\/calcChain\.xml"[^>]*\/>/g, '')
    zip.file(ctPath, ct)
    const relsSinCalcChain = (await zip.file(relsPath)!.async('string'))
      .replace(/<Relationship[^>]*Target="calcChain\.xml"[^>]*\/>/g, '')
    zip.file(relsPath, relsSinCalcChain)
  }

  // Tablas dinámicas: no las necesitamos y sus cachés pesan varios MB.
  Object.keys(zip.files)
    .filter(name => name.startsWith('xl/pivotCache/') || name.startsWith('xl/pivotTables/'))
    .forEach(name => zip.remove(name))

  const wbRelsSinPivots = (await zip.file(relsPath)!.async('string'))
    .replace(/<Relationship[^>]*Target="pivotCache\/[^"]*"[^>]*\/>/g, '')
  zip.file(relsPath, wbRelsSinPivots)

  const wbXmlSinPivots = (await zip.file(wbPath)!.async('string'))
    .replace(/<pivotCaches>[\s\S]*?<\/pivotCaches>/g, '')
  zip.file(wbPath, wbXmlSinPivots)

  // Slicers: mismo motivo — no los necesitamos y son otra fuente de XML
  // (fechas agrupadas, selección de valores) que exceljs puede no soportar.
  Object.keys(zip.files)
    .filter(name => name.startsWith('xl/slicerCaches/') || name.startsWith('xl/slicers/'))
    .forEach(name => zip.remove(name))

  const wbRelsSinSlicers = (await zip.file(relsPath)!.async('string'))
    .replace(/<Relationship[^>]*Target="slicer(Caches)?\/[^"]*"[^>]*\/>/g, '')
  zip.file(relsPath, wbRelsSinSlicers)

  const wbXmlSinSlicers = (await zip.file(wbPath)!.async('string'))
    .replace(/<x15:slicerCaches>[\s\S]*?<\/x15:slicerCaches>/g, '')
  zip.file(wbPath, wbXmlSinSlicers)

  const sheetRelsRestantes = Object.keys(zip.files).filter(n => n.startsWith('xl/worksheets/_rels/'))
  for (const name of sheetRelsRestantes) {
    const content = (await zip.file(name)!.async('string'))
      .replace(/<Relationship[^>]*Target="\.\.\/pivotTables\/[^"]*"[^>]*\/>/g, '')
      .replace(/<Relationship[^>]*Target="\.\.\/slicers\/[^"]*"[^>]*\/>/g, '')
    zip.file(name, content)
  }

  // AutoFilter: exceljs no soporta el nodo <dateGroupItem> que Excel genera
  // para filtros de columna agrupados por fecha, y revienta el parseo
  // completo si alguien deja uno activo al guardar. No necesitamos el
  // estado del filtro (leemos las celdas crudas), así que se descarta.
  //
  // "Reporte Showare" solo crece (nunca se depura) y es, con mucho, la hoja
  // más grande del libro. Se opera en Buffer (ver quitarAutoFilterBuffer)
  // en vez de cargarla como string de JS — confirmado en producción que ya
  // es lo bastante grande como para que jszip reviente con "Invalid string
  // length" al construir esa string internamente.
  const filesConAutoFilter = Object.keys(zip.files).filter(
    n => /^xl\/tables\/table\d+\.xml$/.test(n) || /^xl\/worksheets\/sheet\d+\.xml$/.test(n)
  )
  console.log(`[finanzas-panatickets] archivos a sanear de autoFilter: ${filesConAutoFilter.length} (${filesConAutoFilter.join(', ')})`)
  for (const name of filesConAutoFilter) {
    const raw = await zip.file(name)!.async('nodebuffer')
    console.log(`[finanzas-panatickets] sanear ${name}: ${raw.length} bytes`)
    zip.file(name, quitarAutoFilterBuffer(raw))
    logMemoria(`tras sanear ${name}`)
  }

  // Nivel de compresión bajo: exceljs vuelve a descomprimir este buffer
  // de inmediato, así que comprimir fuerte (nivel por defecto) solo hace
  // más lento todo el proceso sin ningún beneficio (nunca se guarda ni se
  // transmite). STORE (sin comprimir) se probó y sale peor: el buffer sin
  // comprimir queda ~10x más grande y exceljs tarda más en leerlo.
  logMemoria('antes de generateAsync')
  const resultado = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 1 } })
  console.log(`[finanzas-panatickets] buffer saneado final: ${resultado.length} bytes`)
  logMemoria('después de generateAsync')
  return resultado
}

// ---------- Columnas de "Reporte Showare" (fila 6 = encabezados, datos desde fila 7) ----------
const COL = {
  orderId: 2,
  fechaCompra: 3,
  hora: 4,
  ampm: 5,
  estatusCompra: 6,
  precio: 8,
  cxs: 9,
  spac: 10,
  itbms: 11,
  total: 12,
  codigoPrecio: 14,
  evento: 16,
  detallePago: 25,
  bacLiq: 31,
  metroLiq: 32,
  yappyWeb: 33,
  yappy89: 34,
  global: 35,
  achEfectivo: 37,
  taquilla: 38,
  filtroBancos: 39,
  filtroShoware: 40, // "incluir" — usado en las fórmulas contables de Cobros/Eventos por Liquidar/Costo por servicio
  bacAbono: 41,
  metroAbono: 42,
  yappyAbono: 43,     // Yappy Web
  globalAbono: 44,
  // 45 = "Autorizar Global" (no usado)
  yappy89Abono: 46,   // YAPPY (89) tiene su propia columna de abono, distinta de Yappy Web
  eventoActivo: 47,   // "Evento Activo/Cancelado/Completado" — antes leíamos por error la 45 ("Autorizar Global")
} as const

const EXCLUDE_CODIGO_PRECIO = new Set(['Cortesia', 'Cortesias'])
const EXCLUDE_DETALLE_PAGO = new Set([
  'Free (52)', 'WEB USER (24)', 'Yappywebuser (101)', 'PRUEBA (41)', 'PROMOTOR (25)',
])

// Number.isNaN(d.getTime()) detecta un Date inválido (ej. fórmula rota o
// referencia a una celda vacía) sin que .toISOString() reviente con
// "RangeError: Invalid time value" y tumbe todo el sync por una sola celda.
function dateToIsoSafe(d: Date): string | null {
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}

// Replica utils.isDateFmt / utils.excelToDate de exceljs (no las exporta
// públicamente): el lector en streaming, a diferencia de la carga completa,
// NO convierte el resultado de una celda con fórmula a Date aunque la celda
// tenga formato de fecha — siempre hace parseFloat (ver worksheet-reader.js,
// rama `if (c.f)`). Como el equipo usa fórmulas tipo "=fecha_anterior+1"
// para autocompletar fechas consecutivas, sin esto esas filas se perdían
// silenciosamente en streaming.
function esFormatoFecha(fmt: string | undefined | null): boolean {
  if (!fmt) return false
  const limpio = fmt.replace(/\[[^\]]*]/g, '').replace(/"[^"]*"/g, '')
  return /[ymdhMsb]+/.test(limpio)
}
function serialExcelADate(serial: number): Date {
  return new Date(Math.round((serial - 25569) * 24 * 3600 * 1000))
}

// Las fórmulas de "Fecha de Abono" del Excel buscan por una columna de
// autorización bancaria que puede venir en blanco — cuando eso pasa,
// BUSCARV("", rango, ...) a veces "encuentra" por accidente otra fila en
// blanco de la hoja de origen y devuelve lo que sea que haya en esa celda
// (no es un error de fórmula, así que SI.ERROR no lo filtra). El resultado
// puede ser cualquier texto que no sea una fecha real. Se valida el formato
// antes de usarlo — si no calza, se prefiere la fecha de compra (f) en vez
// de guardar basura.
function esFechaIsoValida(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return false
  const [, , mm, dd] = m
  const mes = Number(mm)
  const dia = Number(dd)
  return mes >= 1 && mes <= 12 && dia >= 1 && dia <= 31
}

function extractValue(cell: ExcelJS.Cell): string | number | null {
  const v = cell.value
  if (v === null || v === undefined) return null
  if (typeof v === 'object') {
    if ('richText' in v) return (v.richText as { text: string }[]).map(t => t.text).join('')
    if ('result' in v) {
      // El resultado de una fórmula (ej. "=fecha_anterior+1", común para
      // autocompletar fechas consecutivas) puede ser un Date real — sin
      // este chequeo se devolvía el objeto Date crudo en vez de ISO, y
      // cualquier columna de fecha calculada por fórmula quedaba
      // silenciosamente excluida (String(Date) no matchea el regex ISO).
      const r = (v as { result?: unknown }).result
      if (r === null || r === undefined) return null
      if (r instanceof Date) return dateToIsoSafe(r)
      if (typeof r === 'number' && esFormatoFecha(cell.numFmt)) return dateToIsoSafe(serialExcelADate(r))
      return r as string | number
    }
    if ('text' in v) return (v as { text: string }).text
    if (v instanceof Date) return dateToIsoSafe(v)
    return null
  }
  return typeof v === 'boolean' ? String(v) : v
}

// Acepta ISO (YYYY-MM-DD) o d/m/yyyy · d-m-yyyy (formato usado en Panamá) y
// normaliza a ISO. Las fechas de "Saldos Banco" no siempre son un Date real
// de Excel — a veces son texto tecleado a mano en cualquiera de estos formatos.
function parseFechaFlexible(raw: string): string | null {
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  const dmy = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`
  return null
}

function extractTime(v: ExcelJS.CellValue): string | null {
  if (v instanceof Date) {
    const h = String(v.getUTCHours()).padStart(2, '0')
    const m = String(v.getUTCMinutes()).padStart(2, '0')
    return `${h}:${m}`
  }
  return null
}

function toNumber(v: string | number | null): number | null {
  if (v === null) return null
  if (typeof v === 'number') return v
  const cleaned = v.replace(/[$,]/g, '').trim()
  if (cleaned === '' || cleaned === '-') return null
  const n = parseFloat(cleaned)
  return Number.isNaN(n) ? null : n
}

// Estas 7 columnas de "número de liquidación" usan sus propias fórmulas
// BUSCARV con la convención "si el resultado es 0, no hay valor" (ej.
// =SI.ERROR(SI(BUSCARV(...)=0;"";BUSCARV(...));"")). Sin tratar 0 igual que
// "No Esta"/vacío, una fila liquidada por OTRO banco (con 0 de relleno en
// esta columna) se clasificaba erróneamente en el primer banco de la lista
// que devolviera "no es no-esta" — así, filas de Global con 0 en "BAC Nro
// Liquidacion" terminaban marcadas como BAC y leyendo su columna de abono
// (casi siempre vacía para ellas) en vez de la de Global.
function isNoEsta(v: string | number | null): boolean {
  if (v === null) return true
  const s = String(v).trim()
  return s === '' || s === '0' || /^no\s*est[aá]/i.test(s)
}

// El estatus de evento viene de dos hojas distintas con vocabulario libre
// — se normaliza a las 3 categorías del AutoFilter nativo de la columna
// "Evento Activo/Cancelado/Completado" en Reporte Showare (Activo,
// Cancelado, Completado). Se compara por prefijo (no exacto) para tolerar
// variantes de género/texto extra que ya causaron falsos "Sin estatus" antes
// (ej. "Cancelada" en vez de "Cancelado", o notas pegadas al final);
// cualquier otra cosa (incluyendo vacío) cae en "Sin estatus".
function normalizarEstadoEvento(v: string | number | null): string {
  const s = String(v ?? '').trim()
  if (/^activ/i.test(s)) return 'Activo'
  if (/^cancel/i.test(s)) return 'Cancelado'
  if (/^complet/i.test(s)) return 'Completado'
  return 'Sin estatus'
}

interface VentaRow {
  id: number | null
  f: string
  hora: string | null
  ev: string
  p: number
  cxs: number
  spac: number
  itbms: number
  tot: number
  bk: string
  ab: string
  st: string
}

interface CanceladaRow {
  id: number | null
  f: string
  ev: string
  cp: string
  dp: number
  p: number
  cxs: number
  tot: number
}

function bankChannel(getRaw: (col: number) => string | number | null, detallePago: string | number | null) {
  if (!isNoEsta(getRaw(COL.bacLiq))) return { bk: 'BAC', abonoCol: COL.bacAbono }
  if (!isNoEsta(getRaw(COL.metroLiq))) return { bk: 'Metrobank', abonoCol: COL.metroAbono }
  if (!isNoEsta(getRaw(COL.yappyWeb))) return { bk: 'Yappy Web', abonoCol: COL.yappyAbono }
  if (!isNoEsta(getRaw(COL.yappy89))) return { bk: 'YAPPY (89)', abonoCol: COL.yappy89Abono }
  if (!isNoEsta(getRaw(COL.global))) return { bk: 'Global', abonoCol: COL.globalAbono }
  if (!isNoEsta(getRaw(COL.achEfectivo))) {
    const dp = String(detallePago ?? '')
    return { bk: dp.startsWith('Efectivo') ? 'Efectivo' : 'ACH', abonoCol: null }
  }
  if (!isNoEsta(getRaw(COL.taquilla))) return { bk: 'Taquilla', abonoCol: null }
  return { bk: '—', abonoCol: null }
}

function pagoBucket(detallePago: string | number | null): string {
  const dp = String(detallePago ?? '')
  if (dp.startsWith('VISA') || dp.startsWith('TARJETA VISA') || dp.startsWith('MasterCard') || dp.startsWith('TARJETA MASTERCARD')) {
    return 'Visa y Mastercard'
  }
  if (dp.startsWith('TarjetaDebito')) return 'Tarjeta de Débito'
  if (dp.startsWith('TAQUILLA')) return 'Taquilla'
  return 'Otros (Tarjeta Crédito genérica)'
}

interface ContabilidadAccum {
  totalIncluidoActivo: number
  cxsIncluidoActivo: number
}

function procesarFilaShoware(
  row: ExcelJS.Row,
  rowNum: number,
  ventas: VentaRow[],
  canceladas: CanceladaRow[],
  pendientes: Map<string, { qty: number; monto: number }>,
  contabilidad: ContabilidadAccum
) {
  if (rowNum < 7) return
  const get = (col: number) => extractValue(row.getCell(col))

  const fechaRaw = get(COL.fechaCompra)
  const f = typeof fechaRaw === 'string' ? fechaRaw.slice(0, 10) : null
  if (!f) return

  const estatus = String(get(COL.estatusCompra) ?? '')
  const codigoPrecio = get(COL.codigoPrecio)
  const detallePago = get(COL.detallePago)
  const orderId = get(COL.orderId)
  const ev = String(get(COL.evento) ?? '')
  const tot = Number(get(COL.total)) || 0
  const p = Number(get(COL.precio)) || 0
  const cxs = Number(get(COL.cxs)) || 0

  // Eventos por Liquidar / Costo por servicio: criterio propio e
  // independiente del resto de esta función (Filtro Bancos, cancelación,
  // exclusiones) — solo mira Filtro Showare="incluir" y el estatus del
  // evento (misma columna ya normalizada para "Estado del Evento").
  const filtroShoware = String(get(COL.filtroShoware) ?? '').trim().toLowerCase()
  if (filtroShoware === 'incluir' && normalizarEstadoEvento(get(COL.eventoActivo)) === 'Activo') {
    contabilidad.totalIncluidoActivo += tot
    contabilidad.cxsIncluidoActivo += cxs
  }

  const excluida = EXCLUDE_CODIGO_PRECIO.has(String(codigoPrecio ?? '')) || EXCLUDE_DETALLE_PAGO.has(String(detallePago ?? ''))

  if (estatus === 'Cancelada') {
    if (excluida) return
    canceladas.push({
      id: typeof orderId === 'number' ? orderId : null,
      f, ev,
      cp: String(codigoPrecio ?? ''),
      dp: 0,
      p, cxs, tot,
    })
    return
  }

  if (excluida) return
  const filtroBancos = String(get(COL.filtroBancos) ?? '')
  if (filtroBancos !== 'OK') {
    const bucket = pagoBucket(detallePago)
    if (!pendientes.has(bucket)) pendientes.set(bucket, { qty: 0, monto: 0 })
    const a = pendientes.get(bucket)!
    a.qty += 1
    a.monto += tot
    return
  }

  const { bk, abonoCol } = bankChannel(get, detallePago)
  const abonoRaw = abonoCol ? get(abonoCol) : null
  const abonoSlice = typeof abonoRaw === 'string' ? abonoRaw.slice(0, 10) : null
  const ab = abonoSlice && esFechaIsoValida(abonoSlice) ? abonoSlice : f

  const hora = extractTime(row.getCell(COL.hora).value)

  const eventoActivo = get(COL.eventoActivo)

  ventas.push({
    id: typeof orderId === 'number' ? orderId : null,
    f, hora, ev,
    p, cxs,
    spac: Number(get(COL.spac)) || 0,
    itbms: Number(get(COL.itbms)) || 0,
    tot, bk, ab,
    st: normalizarEstadoEvento(eventoActivo),
  })
}

interface SaldoDia {
  fecha: string // ISO YYYY-MM-DD
  fecha_display: string // dd/mm/yyyy
  bancos: { label: string; value: number; contable: number; diferencia: number }[]
  subtotal_bancos: number
  subtotal_contable: number
  subtotal_diferencia: number
  conceptos: { label: string; value: number }[]
}

// D..M = 10 bancos (se agregó "AV Securities" en M, columna 13, corriendo
// Subtotal Bancos/conceptos/Capital de Trabajo un lugar a la derecha cada
// uno, y sumando una décima columna al bloque contable al final, Y..AH).
const BANK_COLS = [4, 5, 6, 7, 8, 9, 10, 11, 12, 13]
const CONTABLE_COLS = [25, 26, 27, 28, 29, 30, 31, 32, 33, 34]
const CONCEPT_COLS = [15, 16, 17, 18, 19, 20, 21, 22, 23]

interface SaldosBancoCtx {
  bankLabels: Record<number, string>
  conceptLabels: Record<number, string>
  dias: SaldoDia[]
}

/**
 * Procesa una fila de "Saldos Banco" (fila 6 = encabezados de banco/concepto,
 * datos desde fila 7). Acumula en ctx.dias TODOS los días con saldos
 * bancarios completos (no solo el más reciente) — así el dashboard puede
 * mostrar el saldo "al día X" según el filtro de fecha en vez de estar
 * pegado siempre al último día del Excel, que a veces trae el Saldo Bancario
 * ya cargado pero el Contable todavía no (contabilidad va con retraso) y por
 * eso sale en $0.
 */
function procesarFilaSaldos(row: ExcelJS.Row, rowNum: number, ctx: SaldosBancoCtx) {
  if (rowNum === 6) {
    row.eachCell({ includeEmpty: false }, (cell, colNum) => {
      const v = extractValue(cell)
      if (BANK_COLS.includes(colNum)) ctx.bankLabels[colNum] = String(v)
      if (CONCEPT_COLS.includes(colNum)) ctx.conceptLabels[colNum] = String(v)
    })
    return
  }
  if (rowNum < 7) return

  const allBanksFilled = BANK_COLS.every(c => toNumber(extractValue(row.getCell(c))) !== null)
  if (!allBanksFilled) return

  const fechaRaw = extractValue(row.getCell(2))
  const fechaStr = typeof fechaRaw === 'string' ? fechaRaw : String(fechaRaw ?? '')
  const fechaIso = parseFechaFlexible(fechaStr)
  if (!fechaIso) return // necesitamos poder interpretar la fecha para indexar por día
  const [, mFecha, dFecha] = fechaIso.split('-')

  const get = (col: number) => toNumber(extractValue(row.getCell(col))) ?? 0
  const bancos = BANK_COLS.map((c, i) => {
    const value = get(c)
    const contable = get(CONTABLE_COLS[i])
    return { label: ctx.bankLabels[c], value, contable, diferencia: value - contable }
  })
  const subtotal_bancos = get(14)
  const subtotal_contable = bancos.reduce((s, b) => s + b.contable, 0)
  const conceptos = CONCEPT_COLS.map(c => ({ label: ctx.conceptLabels[c], value: get(c) }))
  const capitalTrabajo = get(24)

  ctx.dias.push({
    fecha: fechaIso,
    fecha_display: `${dFecha}/${mFecha}/${fechaIso.slice(0, 4)}`,
    bancos,
    subtotal_bancos,
    subtotal_contable,
    subtotal_diferencia: subtotal_bancos - subtotal_contable,
    conceptos: [...conceptos, { label: 'Capital de Trabajo', value: capitalTrabajo }],
  })
}

function procesarFilaAnticipos(row: ExcelJS.Row, rowNum: number, anticipos: { label: string; value: number; estado: string }[]) {
  if (rowNum < 8) return
  const evento = extractValue(row.getCell(2))
  const estado = extractValue(row.getCell(3))
  const adelanto = toNumber(extractValue(row.getCell(4)))
  if (!evento || adelanto === null) return
  anticipos.push({ label: String(evento), value: adelanto, estado: normalizarEstadoEvento(estado) })
}

interface TransitoCtx {
  colFecha: number | null
  colTdc: number | null
  colAch: number | null
  totalTdc: number | null
  totalAch: number | null
}

function esColumnaTransitoTdc(v: string): boolean {
  return /tr[aá]nsito/.test(v) && /(tdc|web)/.test(v)
}
function esColumnaTransitoAch(v: string): boolean {
  return /tr[aá]nsito/.test(v) && /(ach|efec|taq)/.test(v)
}

/**
 * "En Tránsito" no es una sola celda: la hoja trae un resumen del día de
 * corte (un solo día, no sirve) y, más abajo, la tabla "DETALLE POR DÍA"
 * con una fila por fecha de compra y sus columnas de tránsito propias
 * (netas, pueden ser positivas o negativas según el día), separadas en
 * "Tránsito TDC/Otros" (tarjeta de crédito/web) y "Tránsito ACH/Efec/Taq".
 * El monto real es la fila TOTAL al final de esa tabla, que suma cada
 * columna de todos los días. Se ubican las columnas por texto de
 * encabezado ("Fecha" + ambas de tránsito juntas en la misma fila) en vez
 * de por letra fija — el resumen del día de corte usa columnas y
 * etiquetas parecidas y no queremos confundirlo con la tabla real.
 */
function procesarFilaTransito(row: ExcelJS.Row, ctx: TransitoCtx) {
  if (ctx.totalTdc !== null && ctx.totalAch !== null) return
  if (ctx.colFecha === null || ctx.colTdc === null || ctx.colAch === null) {
    let colFecha: number | null = null
    let colTdc: number | null = null
    let colAch: number | null = null
    row.eachCell({ includeEmpty: false }, (cell, colNum) => {
      const v = String(extractValue(cell) ?? '').trim().toLowerCase()
      if (v === 'fecha') colFecha = colNum
      if (esColumnaTransitoTdc(v)) colTdc = colNum
      if (esColumnaTransitoAch(v)) colAch = colNum
    })
    if (colFecha !== null && colTdc !== null && colAch !== null) {
      ctx.colFecha = colFecha
      ctx.colTdc = colTdc
      ctx.colAch = colAch
    }
    return
  }
  const fechaCell = String(extractValue(row.getCell(ctx.colFecha)) ?? '').trim().toLowerCase()
  if (fechaCell === 'total') {
    ctx.totalTdc = toNumber(extractValue(row.getCell(ctx.colTdc)))
    ctx.totalAch = toNumber(extractValue(row.getCell(ctx.colAch)))
  }
}

const SHEET_SHOWARE = 'Reporte Showare'
const SHEET_SALDOS = 'Saldos Banco'
const SHEET_ANTICIPOS = 'Estatus evento'
const SHEET_TRANSITO = 'En transito'

/**
 * Recorre las 3 hojas necesarias en una sola pasada en streaming (fila por
 * fila, sin cargar el libro entero en memoria) — con archivos de decenas de
 * miles de filas, ExcelJS.Workbook().xlsx.load() (carga completa) llegó a
 * tardar más de los 300s que da Vercel. `styles: 'cache'` es obligatorio:
 * sin él, ExcelJS no puede saber qué celdas numéricas son fechas (lo decide
 * por el formato de número del estilo) y las fechas dejarían de convertirse
 * a Date silenciosamente.
 */
async function parseWorkbookStreaming(buffer: Buffer) {
  logMemoria('inicio parseWorkbookStreaming')
  const ventas: VentaRow[] = []
  const canceladas: CanceladaRow[] = []
  const pendientes = new Map<string, { qty: number; monto: number }>()
  const anticipos: { label: string; value: number; estado: string }[] = []
  const saldosCtx: SaldosBancoCtx = { bankLabels: {}, conceptLabels: {}, dias: [] }
  const contabilidad: ContabilidadAccum = { totalIncluidoActivo: 0, cxsIncluidoActivo: 0 }
  const transitoCtx: TransitoCtx = { colFecha: null, colTdc: null, colAch: null, totalTdc: null, totalAch: null }

  let vioShoware = false
  let vioSaldos = false
  let vioTransito = false

  const workbookReader = new ExcelJS.stream.xlsx.WorkbookReader(Readable.from(buffer), {
    sharedStrings: 'cache',
    hyperlinks: 'ignore',
    worksheets: 'emit',
    styles: 'cache',
  })

  for await (const worksheetReaderRaw of workbookReader) {
    // La versión de tipos de exceljs no declara `.name` en WorksheetReader,
    // aunque sí existe en tiempo de ejecución (viene del workbook.xml).
    const worksheetReader = worksheetReaderRaw as ExcelJS.stream.xlsx.WorksheetReader & { name: string }
    if (worksheetReader.name === SHEET_SHOWARE) {
      vioShoware = true
      logMemoria(`inicio hoja ${SHEET_SHOWARE}`)
      for await (const row of worksheetReader) {
        procesarFilaShoware(row, row.number, ventas, canceladas, pendientes, contabilidad)
        if (row.number % 20000 === 0) logMemoria(`${SHEET_SHOWARE} fila ${row.number}`)
      }
      logMemoria(`fin hoja ${SHEET_SHOWARE} (${ventas.length} ventas, ${canceladas.length} canceladas)`)
    } else if (worksheetReader.name === SHEET_SALDOS) {
      vioSaldos = true
      for await (const row of worksheetReader) {
        procesarFilaSaldos(row, row.number, saldosCtx)
      }
    } else if (worksheetReader.name === SHEET_ANTICIPOS) {
      for await (const row of worksheetReader) {
        procesarFilaAnticipos(row, row.number, anticipos)
      }
    } else if (worksheetReader.name === SHEET_TRANSITO) {
      vioTransito = true
      for await (const row of worksheetReader) {
        procesarFilaTransito(row, transitoCtx)
      }
    }
  }

  if (!vioShoware) throw new Error('No se encontró la hoja "Reporte Showare" en el Excel')
  if (!vioSaldos || !saldosCtx.dias.length) {
    throw new Error('No se encontró ningún día con saldos bancarios completos en "Saldos Banco"')
  }
  if (!vioTransito || transitoCtx.totalTdc === null || transitoCtx.totalAch === null) {
    throw new Error('No se encontró la fila TOTAL de la tabla "DETALLE POR DÍA" en la hoja "En transito"')
  }
  const transitoTdc = transitoCtx.totalTdc
  const transitoAch = transitoCtx.totalAch

  const total_anticipo = anticipos.reduce((s, a) => s + a.value, 0)
  const costoPorServicio = contabilidad.cxsIncluidoActivo
  const eventosPorLiquidar = contabilidad.totalIncluidoActivo - contabilidad.cxsIncluidoActivo

  logMemoria('fin parseWorkbookStreaming')
  return {
    ventas, canceladas, pendientes, saldosPorDia: saldosCtx.dias, anticipos, total_anticipo,
    costoPorServicio, eventosPorLiquidar, transitoTdc, transitoAch,
  }
}

function fmtDay(iso: string) {
  const [, m, d] = iso.split('-')
  const meses = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
  return `${d} ${meses[parseInt(m, 10) - 1]}`
}
function fmtDayLong(iso: string) {
  const [, m, d] = iso.split('-')
  const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']
  return `${d} de ${meses[parseInt(m, 10) - 1]}`
}
function addDaysISO(iso: string, n: number) {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

function computeExecSummary(ventas: VentaRow[], canceladas: CanceladaRow[], globalSummary: { monto: number }[]) {
  const days = Array.from(new Set(ventas.map(v => v.f))).sort()
  const grand_total = ventas.reduce((s, v) => s + v.tot, 0)
  const global_total = globalSummary.reduce((s, g) => s + g.monto, 0)

  const byDay = new Map<string, { monto: number; qty: number }>()
  ventas.forEach(v => {
    if (!byDay.has(v.f)) byDay.set(v.f, { monto: 0, qty: 0 })
    const a = byDay.get(v.f)!
    a.monto += v.tot; a.qty += 1
  })

  const lastDay = days[days.length - 1] ?? null
  const prevDay = days[days.length - 2] ?? null
  const last = (lastDay ? byDay.get(lastDay) : undefined) ?? { monto: 0, qty: 0 }
  const prev = (prevDay ? byDay.get(prevDay) : undefined) ?? { monto: 0, qty: 0 }
  const day_pct = prev.monto ? ((last.monto - prev.monto) / prev.monto) * 100 : 0

  const last7 = days.slice(-7)
  const prev7 = days.slice(-14, -7)
  const sumDays = (ds: string[]) => ds.reduce((s, d) => s + (byDay.get(d)?.monto ?? 0), 0)
  const qtyDays = (ds: string[]) => ds.reduce((s, d) => s + (byDay.get(d)?.qty ?? 0), 0)
  const week_cur = { start: last7[0] ?? null, end: last7[last7.length - 1] ?? null, monto: sumDays(last7), qty: qtyDays(last7) }
  const week_prev = { start: prev7[0] ?? last7[0] ?? null, end: prev7[prev7.length - 1] ?? last7[0] ?? null, monto: sumDays(prev7), qty: qtyDays(prev7) }
  const week_pct = week_prev.monto ? ((week_cur.monto - week_prev.monto) / week_prev.monto) * 100 : 0
  const week_days = last7.map(f => ({ f, monto: byDay.get(f)?.monto ?? 0, qty: byDay.get(f)?.qty ?? 0 }))

  const eventoTotal = (ds: string[]) => {
    const map = new Map<string, number>()
    ventas.forEach(v => {
      if (!ds.includes(v.f)) return
      map.set(v.ev, (map.get(v.ev) ?? 0) + v.tot)
    })
    return map
  }
  const curMap = eventoTotal(last7)
  const prevMap = eventoTotal(prev7.length ? prev7 : last7)
  const moves: { ev: string; prev: number; cur: number; pct: number }[] = []
  curMap.forEach((cur, ev) => {
    const prevAmt = prevMap.get(ev) ?? 0
    if (cur < 200 || prevAmt < 200) return
    moves.push({ ev, prev: prevAmt, cur, pct: ((cur - prevAmt) / prevAmt) * 100 })
  })
  const alzas = [...moves].sort((a, b) => b.pct - a.pct).slice(0, 3)
  const caidas = [...moves].filter(m => m.pct < 0).sort((a, b) => a.pct - b.pct).slice(0, 3)

  const totalPorEvento = new Map<string, number>()
  ventas.forEach(v => totalPorEvento.set(v.ev, (totalPorEvento.get(v.ev) ?? 0) + v.tot))
  const top3_events = Array.from(totalPorEvento.entries())
    .map(([ev, monto]) => ({ ev, monto, pct: grand_total ? (monto / grand_total) * 100 : 0 }))
    .sort((a, b) => b.monto - a.monto).slice(0, 3)
  const top3_share_pct = top3_events.reduce((s, e) => s + e.pct, 0)

  const cancel_qty = canceladas.length
  const cancel_amt = canceladas.reduce((s, c) => s + c.tot, 0)
  const cancel_pct = (cancel_qty + ventas.length) ? (cancel_qty / (cancel_qty + ventas.length)) * 100 : 0

  return {
    last_day: { f: lastDay, monto: last.monto, qty: last.qty },
    prev_day: { f: prevDay, monto: prev.monto, qty: prev.qty },
    day_pct,
    week_cur, week_prev, week_pct, week_days,
    alzas, caidas,
    top3_share_pct, top3_events,
    global_total, grand_total,
    global_pct: (grand_total + global_total) ? (global_total / (grand_total + global_total)) * 100 : 0,
    cancel_qty, cancel_pct, cancel_amt,
  }
}

export async function computeFinanzasPanatickets() {
  const t0 = Date.now()
  const rawBuffer = await downloadPanaticketsFinanzasExcel()
  const t1 = Date.now()
  console.log(`[finanzas-panatickets] descargado: ${rawBuffer.length} bytes`)
  logMemoria('tras descarga')
  const buffer = await sanitizeWorkbookBuffer(rawBuffer)
  const t2 = Date.now()

  const { ventas, canceladas, pendientes, saldosPorDia, anticipos, total_anticipo, costoPorServicio, eventosPorLiquidar, transitoTdc, transitoAch } = await parseWorkbookStreaming(buffer)
  const t3 = Date.now()

  console.log(
    `[finanzas-panatickets] descarga=${t1 - t0}ms sanear=${t2 - t1}ms (rawBytes=${rawBuffer.length}, saneadoBytes=${buffer.length}) parseoStreaming=${t3 - t2}ms (ventas=${ventas.length}, dias=${saldosPorDia.length}, anticipos=${anticipos.length})`
  )

  // El estatus por venta venía de la columna "eventoActivo" de Reporte
  // Showare, pero esa columna usa un vocabulario totalmente distinto al de
  // la hoja "Estatus evento" (de ahí que, tras normalizar, casi todo cayera
  // en "Sin estatus" y filtrar por "Activo" dejara las ventas en cero pese a
  // que "Eventos con anticipos" sí mostraba eventos Activos). Se reemplaza
  // por el estatus de "Estatus evento", buscando por nombre de evento — la
  // misma fuente que ya funciona bien para esa tabla — y solo se deja el
  // valor original como respaldo si el evento no aparece ahí.
  const nombreNormalizado = (s: string) => s.trim().toUpperCase()
  const estadoPorEvento = new Map(anticipos.map(a => [nombreNormalizado(a.label), a.estado]))
  for (const v of ventas) {
    const estado = estadoPorEvento.get(nombreNormalizado(v.ev))
    if (estado) v.st = estado
  }

  const GLOBAL_SUMMARY = Array.from(pendientes.entries())
    .map(([label, v]) => ({ label, qty: v.qty, monto: v.monto }))
    .sort((a, b) => b.monto - a.monto)

  const EXEC_SUMMARY = computeExecSummary(ventas, canceladas, GLOBAL_SUMMARY)

  const DATA = ventas.map(v => ({
    id: v.id, f: v.f, hora: v.hora, ev: v.ev, p: v.p, cxs: v.cxs, spac: v.spac,
    itbms: v.itbms, tot: v.tot, bk: v.bk, ab: v.ab, st: v.st,
  }))
  const CANCELADAS = canceladas

  return {
    DATA, CANCELADAS,
    SALDOS_POR_DIA: saldosPorDia,
    ANTICIPOS: anticipos,
    TOTAL_ANTICIPO: total_anticipo,
    GLOBAL_SUMMARY, EXEC_SUMMARY,
    COSTO_POR_SERVICIO: costoPorServicio,
    EVENTOS_POR_LIQUIDAR: eventosPorLiquidar,
    TRANSITO_TDC: transitoTdc,
    TRANSITO_ACH: transitoAch,
    generatedAt: new Date().toISOString(),
  }
}

const BULK_BATCH = 500

type TxClient = Prisma.TransactionClient

/**
 * Reemplaza la tabla completa (TRUNCATE + INSERT en lote) en vez de upsert
 * por id: el N° de orden de Showare no es único por fila (una orden puede
 * traer varias líneas, ej. distintos tipos de boleto), así que no sirve
 * como llave de upsert — Postgres lo rechazó con "cardinality violation" en
 * cuanto un lote traía el mismo orden dos veces. Como cada sync ya trae el
 * estado completo y actual del Excel, reemplazar toda la tabla es más
 * simple y correcto que tratar de reconciliar fila por fila.
 */
async function replaceVentas(tx: TxClient, rows: { id: number | null; f: string; hora: string | null; ev: string; p: number; cxs: number; spac: number; itbms: number; tot: number; bk: string; ab: string; st: string }[]) {
  await tx.$executeRaw`TRUNCATE TABLE panatickets_ventas RESTART IDENTITY`
  const now = new Date()
  for (let i = 0; i < rows.length; i += BULK_BATCH) {
    const batch = rows.slice(i, i + BULK_BATCH)
    const values = Prisma.join(
      batch.map(v => Prisma.sql`(${v.id}, ${v.f}, ${v.hora}, ${v.ev}, ${v.p}, ${v.cxs}, ${v.spac}, ${v.itbms}, ${v.tot}, ${v.bk}, ${v.ab}, ${v.st}, ${now})`)
    )
    await tx.$executeRaw`
      INSERT INTO panatickets_ventas ("ordenId", fecha, hora, evento, precio, cxs, spac, itbms, total, banco, "fechaAbono", estado, "updatedAt")
      VALUES ${values}
    `
  }
}

async function replaceCanceladas(tx: TxClient, rows: { id: number | null; f: string; ev: string; cp: string; p: number; cxs: number; tot: number }[]) {
  await tx.$executeRaw`TRUNCATE TABLE panatickets_canceladas RESTART IDENTITY`
  const now = new Date()
  for (let i = 0; i < rows.length; i += BULK_BATCH) {
    const batch = rows.slice(i, i + BULK_BATCH)
    const values = Prisma.join(
      batch.map(c => Prisma.sql`(${c.id}, ${c.f}, ${c.ev}, ${c.cp}, ${c.p}, ${c.cxs}, ${c.tot}, ${now})`)
    )
    await tx.$executeRaw`
      INSERT INTO panatickets_canceladas ("ordenId", fecha, evento, "codigoPrecio", precio, cxs, total, "updatedAt")
      VALUES ${values}
    `
  }
}

async function replaceSaldosDia(tx: TxClient, dias: SaldoDia[]) {
  await tx.$executeRaw`TRUNCATE TABLE panatickets_saldos_dia`
  const now = new Date()
  for (let i = 0; i < dias.length; i += BULK_BATCH) {
    const batch = dias.slice(i, i + BULK_BATCH)
    const values = Prisma.join(
      batch.map(d => Prisma.sql`(${d.fecha}, ${d.fecha_display}, ${JSON.stringify(d.bancos)}::jsonb, ${d.subtotal_bancos}, ${d.subtotal_contable}, ${d.subtotal_diferencia}, ${JSON.stringify(d.conceptos)}::jsonb, ${now})`)
    )
    await tx.$executeRaw`
      INSERT INTO panatickets_saldos_dia (fecha, "fechaDisplay", bancos, "subtotalBancos", "subtotalContable", "subtotalDiferencia", conceptos, "updatedAt")
      VALUES ${values}
    `
  }
}

/**
 * Sincroniza el Excel de Panatickets a Postgres en vez de dejar que el
 * dashboard lo reprocese en cada carga. Todo en una sola transacción para
 * que un fallo a mitad de camino no deje las tablas vacías/a medias.
 */
async function upsertSnapshot(
  tx: TxClient,
  anticipos: { label: string; value: number; estado: string }[],
  totalAnticipo: number,
  globalSummary: { label: string; qty: number; monto: number }[],
  costoPorServicio: number,
  eventosPorLiquidar: number,
  transitoTdc: number,
  transitoAch: number,
  generatedAt: string
) {
  const data = { anticipos, totalAnticipo, globalSummary, costoPorServicio, eventosPorLiquidar, transitoTdc, transitoAch, generatedAt: new Date(generatedAt) }
  await tx.panaticketsSnapshot.upsert({ where: { id: 1 }, create: { id: 1, ...data }, update: data })
}

export async function syncFinanzasPanatickets() {
  const {
    DATA, CANCELADAS, SALDOS_POR_DIA, ANTICIPOS, TOTAL_ANTICIPO, GLOBAL_SUMMARY,
    COSTO_POR_SERVICIO, EVENTOS_POR_LIQUIDAR, TRANSITO_TDC, TRANSITO_ACH, generatedAt,
  } = await computeFinanzasPanatickets()

  await prisma.$transaction(async tx => {
    await replaceVentas(tx, DATA)
    await replaceCanceladas(tx, CANCELADAS)
    await replaceSaldosDia(tx, SALDOS_POR_DIA)
    await upsertSnapshot(tx, ANTICIPOS, TOTAL_ANTICIPO, GLOBAL_SUMMARY, COSTO_POR_SERVICIO, EVENTOS_POR_LIQUIDAR, TRANSITO_TDC, TRANSITO_ACH, generatedAt)
  }, { timeout: 120_000 })

  return { ventasSincronizadas: DATA.length, canceladasSincronizadas: CANCELADAS.length, diasConSaldos: SALDOS_POR_DIA.length, generatedAt }
}

/**
 * Lee de Postgres el rango pedido (en vez de reprocesar el Excel) y
 * recalcula EXEC_SUMMARY con la misma lógica que antes usaba datos en vivo —
 * sigue siendo "derivado", solo que ahora sobre lo que haya en el rango.
 */
export async function getFinanzasPanaticketsRango(desde: string, hasta: string) {
  const [ventas, canceladas, snapshot, saldosDia, aniosRaw] = await Promise.all([
    prisma.panaticketsVenta.findMany({ where: { fecha: { gte: desde, lte: hasta } }, orderBy: { fecha: 'asc' } }),
    prisma.panaticketsCancelada.findMany({ where: { fecha: { gte: desde, lte: hasta } }, orderBy: { fecha: 'asc' } }),
    prisma.panaticketsSnapshot.findUnique({ where: { id: 1 } }),
    prisma.panaticketsSaldoDia.findMany({ where: { fecha: { gte: desde, lte: hasta } }, orderBy: { fecha: 'asc' } }),
    prisma.$queryRaw<{ anio: string }[]>`SELECT DISTINCT LEFT(fecha, 4) AS anio FROM panatickets_ventas ORDER BY anio DESC`,
  ])

  const DATA = ventas.map(v => ({
    id: v.ordenId, f: v.fecha, hora: v.hora, ev: v.evento, p: v.precio, cxs: v.cxs, spac: v.spac,
    itbms: v.itbms, tot: v.total, bk: v.banco, ab: v.fechaAbono, st: v.estado,
  }))
  const CANCELADAS = canceladas.map(c => ({
    id: c.ordenId, f: c.fecha, ev: c.evento, cp: c.codigoPrecio, dp: 0, p: c.precio, cxs: c.cxs, tot: c.total,
  }))
  const GLOBAL_SUMMARY = (snapshot?.globalSummary as { label: string; qty: number; monto: number }[]) ?? []
  const EXEC_SUMMARY = computeExecSummary(DATA, CANCELADAS, GLOBAL_SUMMARY)

  const anticipos = (snapshot?.anticipos as { label: string; value: number; estado: string }[]) ?? []
  const totalAnticipo = snapshot?.totalAnticipo ?? 0

  // "Eventos por Liquidar" y "Costo por servicio" (Reporte Showare) se
  // insertan justo antes de "Capital de Trabajo": la fila nativa que trae
  // cada día desde Saldos Banco es una versión parcial/incompleta del mismo
  // concepto, así que se quita esa fila nativa (ver toSaldos) y se deja solo
  // la calculada, más completa.
  const transitoTdc = snapshot?.transitoTdc ?? 0
  const transitoAch = snapshot?.transitoAch ?? 0
  const costoPorServicio = snapshot?.costoPorServicio ?? 0
  const eventosPorLiquidar = snapshot?.eventosPorLiquidar ?? 0
  const conceptosCalculados = [
    { label: 'Eventos por Liquidar', value: -eventosPorLiquidar },
    { label: 'Costo por servicio', value: costoPorServicio },
  ]

  const toSaldos = (d: (typeof saldosDia)[number]) => {
    // Las 2 filas nativas de tránsito ("Cobros por Tjta Cdto / Web..." y
    // "Cobros Efectivo y Tjta Cdto Tiendas...") se quedan en su posición
    // pero con su valor reemplazado por el total calculado de la hoja "En
    // transito" (traían valores parciales/vacíos); la segunda además se
    // renombra a "Tránsito ACH - Efectivo - Taquilla (+)" a pedido del
    // usuario. Las nativas de "Eventos por Liquidar"/"Costo por servicio"
    // se descartan del todo — se reemplazan por la versión calculada de
    // conceptosCalculados, más abajo.
    const base = (d.conceptos as { label: string; value: number }[])
      .map(c => {
        const l = c.label.trim().toLowerCase()
        if (l.startsWith('cobros por tjta cdto')) return { label: c.label, value: transitoTdc }
        if (l.startsWith('cobros efectivo')) return { label: 'Tránsito ACH - Efectivo - Taquilla (+)', value: transitoAch }
        return c
      })
      .filter(c => {
        const l = c.label.trim().toLowerCase()
        return !l.startsWith('eventos por liquidar') && !l.startsWith('costo por servicio')
      })
    const capitalIdx = base.findIndex(c => c.label.trim().toLowerCase().startsWith('capital de trab'))
    const conceptos = capitalIdx >= 0
      ? [...base.slice(0, capitalIdx), ...conceptosCalculados, ...base.slice(capitalIdx)]
      : [...base, ...conceptosCalculados]
    return {
      fecha_saldos: d.fechaDisplay,
      bancos: d.bancos as { label: string; value: number; contable: number; diferencia: number }[],
      subtotal_bancos: d.subtotalBancos,
      subtotal_contable: d.subtotalContable,
      subtotal_diferencia: d.subtotalDiferencia,
      conceptos,
      anticipos, total_anticipo: totalAnticipo,
    }
  }

  // El más reciente dentro del rango es el default (equivalente al
  // comportamiento de antes); SALDOS_POR_DIA deja que el filtro de día del
  // dashboard pida cualquier otro día sin otro viaje al servidor.
  const SALDOS = saldosDia.length ? toSaldos(saldosDia[saldosDia.length - 1]) : null
  const SALDOS_POR_DIA = Object.fromEntries(saldosDia.map(d => [d.fecha, toSaldos(d)]))

  return {
    DATA, CANCELADAS, SALDOS, SALDOS_POR_DIA, GLOBAL_SUMMARY, EXEC_SUMMARY,
    generatedAt: (snapshot?.generatedAt ?? new Date()).toISOString(),
    years: aniosRaw.map(r => parseInt(r.anio, 10)).filter(n => !Number.isNaN(n)),
  }
}

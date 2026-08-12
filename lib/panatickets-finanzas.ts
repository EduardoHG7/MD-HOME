import ExcelJS from 'exceljs'
import JSZip from 'jszip'
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
const SHEETS_NECESARIAS = new Set(['Reporte Showare', 'Saldos Banco', 'Estatus evento'])

async function sanitizeWorkbookBuffer(buffer: Buffer): Promise<Buffer> {
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
  const autoFilterRe = /<autoFilter\b[^>]*\/>|<autoFilter\b[^>]*>[\s\S]*?<\/autoFilter>/g
  const filesConAutoFilter = Object.keys(zip.files).filter(
    n => /^xl\/tables\/table\d+\.xml$/.test(n) || /^xl\/worksheets\/sheet\d+\.xml$/.test(n)
  )
  for (const name of filesConAutoFilter) {
    const content = (await zip.file(name)!.async('string')).replace(autoFilterRe, '')
    zip.file(name, content)
  }

  // Nivel de compresión bajo: exceljs vuelve a descomprimir este buffer
  // de inmediato, así que comprimir fuerte (nivel por defecto) solo hace
  // más lento todo el proceso sin ningún beneficio (nunca se guarda ni se
  // transmite). STORE (sin comprimir) se probó y sale peor: el buffer sin
  // comprimir queda ~10x más grande y exceljs tarda más en leerlo.
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 1 } })
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
  bacAbono: 40,
  metroAbono: 41,
  yappyAbono: 42,
  globalAbono: 43,
  eventoActivo: 45,
} as const

const EXCLUDE_CODIGO_PRECIO = new Set(['Cortesia', 'Cortesias'])
const EXCLUDE_DETALLE_PAGO = new Set([
  'Free (52)', 'WEB USER (24)', 'Yappywebuser (101)', 'PRUEBA (41)', 'PROMOTOR (25)',
])

function extractValue(v: ExcelJS.CellValue): string | number | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'object') {
    if ('richText' in v) return (v.richText as { text: string }[]).map(t => t.text).join('')
    if ('result' in v) {
      const r = (v as { result?: unknown }).result
      return r === null || r === undefined ? null : (r as string | number)
    }
    if ('text' in v) return (v as { text: string }).text
    if (v instanceof Date) return v.toISOString().slice(0, 10)
    return null
  }
  return typeof v === 'boolean' ? String(v) : v
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

function isNoEsta(v: string | number | null): boolean {
  if (v === null) return true
  const s = String(v).trim()
  return s === '' || /^no\s*est[aá]/i.test(s)
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
  if (!isNoEsta(getRaw(COL.yappy89))) return { bk: 'YAPPY (89)', abonoCol: COL.yappyAbono }
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

async function parseReporteShoware(wb: ExcelJS.Workbook) {
  const sheet = wb.getWorksheet('Reporte Showare')
  if (!sheet) throw new Error('No se encontró la hoja "Reporte Showare" en el Excel')

  const ventas: VentaRow[] = []
  const canceladas: CanceladaRow[] = []
  const pendientes = new Map<string, { qty: number; monto: number }>()

  sheet.eachRow({ includeEmpty: false }, (row, rowNum) => {
    if (rowNum < 7) return
    const get = (col: number) => extractValue(row.getCell(col).value)

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
    const ab = typeof abonoRaw === 'string' ? abonoRaw.slice(0, 10) : f

    const hora = extractTime(row.getCell(COL.hora).value)

    const eventoActivo = get(COL.eventoActivo)

    ventas.push({
      id: typeof orderId === 'number' ? orderId : null,
      f, hora, ev,
      p, cxs,
      spac: Number(get(COL.spac)) || 0,
      itbms: Number(get(COL.itbms)) || 0,
      tot, bk, ab,
      st: String(eventoActivo ?? '') || 'Cerrado',
    })
  })

  return { ventas, canceladas, pendientes }
}

async function parseSaldosBanco(wb: ExcelJS.Workbook) {
  const sheet = wb.getWorksheet('Saldos Banco')
  if (!sheet) throw new Error('No se encontró la hoja "Saldos Banco" en el Excel')

  const bankCols = [4, 5, 6, 7, 8, 9, 10, 11, 12]
  const bankLabels: Record<number, string> = {}
  const contableCols = [24, 25, 26, 27, 28, 29, 30, 31, 32]
  const conceptCols = [14, 15, 16, 17, 18, 19, 20, 21, 22]
  const conceptLabels: Record<number, string> = {}
  const headerRow = sheet.getRow(6)
  headerRow.eachCell({ includeEmpty: false }, (cell, colNum) => {
    const v = extractValue(cell.value)
    if (bankCols.includes(colNum)) bankLabels[colNum] = String(v)
    if (conceptCols.includes(colNum)) conceptLabels[colNum] = String(v)
  })

  let bestRow: ExcelJS.Row | null = null
  let bestFecha: string | null = null
  for (let r = sheet.rowCount; r >= 7; r--) {
    const row = sheet.getRow(r)
    const allBanksFilled = bankCols.every(c => toNumber(extractValue(row.getCell(c).value)) !== null)
    if (allBanksFilled) {
      bestRow = row
      const fechaRaw = extractValue(row.getCell(2).value)
      const fechaStr = typeof fechaRaw === 'string' ? fechaRaw : String(fechaRaw ?? '')
      const isoMatch = fechaStr.match(/^(\d{4})-(\d{2})-(\d{2})$/)
      bestFecha = isoMatch ? `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}` : fechaStr
      break
    }
  }
  if (!bestRow) throw new Error('No se encontró un día con saldos bancarios completos en "Saldos Banco"')

  const get = (col: number) => toNumber(extractValue(bestRow!.getCell(col).value)) ?? 0

  const bancos = bankCols.map((c, i) => {
    const value = get(c)
    const contable = get(contableCols[i])
    return { label: bankLabels[c], value, contable, diferencia: value - contable }
  })
  const subtotal_bancos = get(13)
  const subtotal_contable = bancos.reduce((s, b) => s + b.contable, 0)
  const conceptos = conceptCols.map(c => ({ label: conceptLabels[c], value: get(c) }))
  const capitalTrabajo = get(23)

  return {
    fecha_saldos: bestFecha ?? '',
    bancos,
    subtotal_bancos,
    subtotal_contable,
    subtotal_diferencia: subtotal_bancos - subtotal_contable,
    conceptos: [...conceptos, { label: 'Capital de Trabajo', value: capitalTrabajo }],
    anticipos: [] as { label: string; value: number }[],
    total_anticipo: 0,
  }
}

async function parseAnticipos(wb: ExcelJS.Workbook) {
  const sheet = wb.getWorksheet('Estatus evento')
  if (!sheet) return { anticipos: [] as { label: string; value: number }[], total_anticipo: 0 }

  const anticipos: { label: string; value: number }[] = []
  sheet.eachRow({ includeEmpty: false }, (row, rowNum) => {
    if (rowNum < 8) return
    const evento = extractValue(row.getCell(2).value)
    const adelanto = toNumber(extractValue(row.getCell(4).value))
    if (!evento || adelanto === null) return
    anticipos.push({ label: String(evento), value: adelanto })
  })
  const total_anticipo = anticipos.reduce((s, a) => s + a.value, 0)
  return { anticipos, total_anticipo }
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
  const buffer = await sanitizeWorkbookBuffer(rawBuffer)
  const t2 = Date.now()
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer)
  const t3 = Date.now()

  const { ventas, canceladas, pendientes } = await parseReporteShoware(wb)
  const t4 = Date.now()
  const saldos = await parseSaldosBanco(wb)
  const { anticipos, total_anticipo } = await parseAnticipos(wb)
  saldos.anticipos = anticipos
  saldos.total_anticipo = total_anticipo
  const t5 = Date.now()

  console.log(
    `[finanzas-panatickets] descarga=${t1 - t0}ms sanear=${t2 - t1}ms (rawBytes=${rawBuffer.length}, saneadoBytes=${buffer.length}) cargaExcel=${t3 - t2}ms parseoShoware=${t4 - t3}ms (ventas=${ventas.length}) saldos/anticipos=${t5 - t4}ms`
  )

  const GLOBAL_SUMMARY = Array.from(pendientes.entries())
    .map(([label, v]) => ({ label, qty: v.qty, monto: v.monto }))
    .sort((a, b) => b.monto - a.monto)

  const EXEC_SUMMARY = computeExecSummary(ventas, canceladas, GLOBAL_SUMMARY)

  const DATA = ventas.map(v => ({
    id: v.id, f: v.f, hora: v.hora, ev: v.ev, p: v.p, cxs: v.cxs, spac: v.spac,
    itbms: v.itbms, tot: v.tot, bk: v.bk, ab: v.ab, st: v.st,
  }))
  const CANCELADAS = canceladas

  return { DATA, CANCELADAS, SALDOS: saldos, GLOBAL_SUMMARY, EXEC_SUMMARY, generatedAt: new Date().toISOString() }
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

/**
 * Sincroniza el Excel de Panatickets a Postgres en vez de dejar que el
 * dashboard lo reprocese en cada carga. Todo en una sola transacción para
 * que un fallo a mitad de camino no deje las tablas vacías/a medias.
 */
async function upsertSnapshot(tx: TxClient, saldos: Awaited<ReturnType<typeof parseSaldosBanco>>, globalSummary: { label: string; qty: number; monto: number }[], generatedAt: string) {
  const data = {
    fechaSaldos: saldos.fecha_saldos,
    bancos: saldos.bancos,
    subtotalBancos: saldos.subtotal_bancos,
    subtotalContable: saldos.subtotal_contable,
    subtotalDiferencia: saldos.subtotal_diferencia,
    conceptos: saldos.conceptos,
    anticipos: saldos.anticipos,
    totalAnticipo: saldos.total_anticipo,
    globalSummary,
    generatedAt: new Date(generatedAt),
  }
  await tx.panaticketsSnapshot.upsert({ where: { id: 1 }, create: { id: 1, ...data }, update: data })
}

export async function syncFinanzasPanatickets() {
  const { DATA, CANCELADAS, SALDOS, GLOBAL_SUMMARY, generatedAt } = await computeFinanzasPanatickets()

  await prisma.$transaction(async tx => {
    await replaceVentas(tx, DATA)
    await replaceCanceladas(tx, CANCELADAS)
    await upsertSnapshot(tx, SALDOS, GLOBAL_SUMMARY, generatedAt)
  }, { timeout: 120_000 })

  return { ventasSincronizadas: DATA.length, canceladasSincronizadas: CANCELADAS.length, generatedAt }
}

/**
 * Lee de Postgres el rango pedido (en vez de reprocesar el Excel) y
 * recalcula EXEC_SUMMARY con la misma lógica que antes usaba datos en vivo —
 * sigue siendo "derivado", solo que ahora sobre lo que haya en el rango.
 */
export async function getFinanzasPanaticketsRango(desde: string, hasta: string) {
  const [ventas, canceladas, snapshot, aniosRaw] = await Promise.all([
    prisma.panaticketsVenta.findMany({ where: { fecha: { gte: desde, lte: hasta } }, orderBy: { fecha: 'asc' } }),
    prisma.panaticketsCancelada.findMany({ where: { fecha: { gte: desde, lte: hasta } }, orderBy: { fecha: 'asc' } }),
    prisma.panaticketsSnapshot.findUnique({ where: { id: 1 } }),
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

  const SALDOS = snapshot ? {
    fecha_saldos: snapshot.fechaSaldos,
    bancos: snapshot.bancos as { label: string; value: number; contable: number; diferencia: number }[],
    subtotal_bancos: snapshot.subtotalBancos,
    subtotal_contable: snapshot.subtotalContable,
    subtotal_diferencia: snapshot.subtotalDiferencia,
    conceptos: snapshot.conceptos as { label: string; value: number }[],
    anticipos: snapshot.anticipos as { label: string; value: number }[],
    total_anticipo: snapshot.totalAnticipo,
  } : null

  return {
    DATA, CANCELADAS, SALDOS, GLOBAL_SUMMARY, EXEC_SUMMARY,
    generatedAt: (snapshot?.generatedAt ?? new Date()).toISOString(),
    years: aniosRaw.map(r => parseInt(r.anio, 10)).filter(n => !Number.isNaN(n)),
  }
}

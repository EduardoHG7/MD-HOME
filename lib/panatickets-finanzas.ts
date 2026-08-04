import ExcelJS from 'exceljs'
import { unstable_cache } from 'next/cache'
import { downloadPanaticketsFinanzasExcel } from './panatickets-sharepoint'

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
    const filtroBancos = get(COL.filtroBancos)
    if (String(filtroBancos ?? '') !== 'OK') return

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

  return { ventas, canceladas }
}

async function parseSaldosBanco(wb: ExcelJS.Workbook) {
  const sheet = wb.getWorksheet('Saldos Banco')
  if (!sheet) throw new Error('No se encontró la hoja "Saldos Banco" en el Excel')

  const bankCols = [4, 5, 6, 7, 8, 9, 10, 11, 12]
  const bankLabels: Record<number, string> = {}
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

  const bancos = bankCols.map(c => ({ label: bankLabels[c], value: get(c) }))
  const subtotal_bancos = get(13)
  const conceptos = conceptCols.map(c => ({ label: conceptLabels[c], value: get(c) }))
  const capitalTrabajo = get(23)

  return {
    fecha_saldos: bestFecha ?? '',
    bancos,
    subtotal_bancos,
    conceptos: [...conceptos, { label: 'Capital de Trabajo', value: capitalTrabajo }],
    anticipos: [] as { label: string; value: number }[],
    total_anticipo: 0,
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

  const lastDay = days[days.length - 1]
  const prevDay = days[days.length - 2]
  const last = byDay.get(lastDay) ?? { monto: 0, qty: 0 }
  const prev = byDay.get(prevDay) ?? { monto: 0, qty: 0 }
  const day_pct = prev.monto ? ((last.monto - prev.monto) / prev.monto) * 100 : 0

  const last7 = days.slice(-7)
  const prev7 = days.slice(-14, -7)
  const sumDays = (ds: string[]) => ds.reduce((s, d) => s + (byDay.get(d)?.monto ?? 0), 0)
  const qtyDays = (ds: string[]) => ds.reduce((s, d) => s + (byDay.get(d)?.qty ?? 0), 0)
  const week_cur = { start: last7[0], end: last7[last7.length - 1], monto: sumDays(last7), qty: qtyDays(last7) }
  const week_prev = { start: prev7[0] ?? last7[0], end: prev7[prev7.length - 1] ?? last7[0], monto: sumDays(prev7), qty: qtyDays(prev7) }
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
  const buffer = await downloadPanaticketsFinanzasExcel()
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer)

  const { ventas, canceladas } = await parseReporteShoware(wb)
  const saldos = await parseSaldosBanco(wb)

  const pendientes = new Map<string, { qty: number; monto: number }>()
  const sheet = wb.getWorksheet('Reporte Showare')!
  sheet.eachRow({ includeEmpty: false }, (row, rowNum) => {
    if (rowNum < 7) return
    const get = (col: number) => extractValue(row.getCell(col).value)
    const estatus = String(get(COL.estatusCompra) ?? '')
    if (estatus === 'Cancelada') return
    const codigoPrecio = get(COL.codigoPrecio)
    const detallePago = get(COL.detallePago)
    if (EXCLUDE_CODIGO_PRECIO.has(String(codigoPrecio ?? '')) || EXCLUDE_DETALLE_PAGO.has(String(detallePago ?? ''))) return
    const filtroBancos = String(get(COL.filtroBancos) ?? '')
    if (filtroBancos === 'OK') return
    const bucket = pagoBucket(detallePago)
    if (!pendientes.has(bucket)) pendientes.set(bucket, { qty: 0, monto: 0 })
    const a = pendientes.get(bucket)!
    a.qty += 1
    a.monto += Number(get(COL.total)) || 0
  })
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

export const getFinanzasPanatickets = unstable_cache(
  computeFinanzasPanatickets,
  ['panatickets-finanzas-showare'],
  { revalidate: 3600 }
)

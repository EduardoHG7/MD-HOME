export const dynamic = 'force-dynamic'
export const maxDuration = 30

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getActiveTenantId } from '@/lib/tenant'
import ExcelJS from 'exceljs'

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const DIA_LETRA = ['D','L','M','M','J','V','S']

// Colores (coinciden con el calendario en pantalla)
const C_MONTAJE    = 'FFEF4444' // rojo-500
const C_EVENTO     = 'FF22C55E' // verde-500
const C_DESMONTAJE = 'FFFB923C' // naranja-400
const C_FINDE      = 'FFF3F4F6' // gris muy claro para sábado/domingo
const C_BANDA      = 'FFF9FAFB' // fondo de la banda de mes
const C_BORDE      = 'FFE5E7EB'

const keyUTC = (d: Date) =>
  `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
const fmt = (s: string | Date | null) => {
  if (!s) return '—'
  const d = new Date(s)
  return `${d.getUTCDate()}/${d.getUTCMonth() + 1}/${d.getUTCFullYear()}`
}
function diasEntre(desde: Date, hasta: Date): string[] {
  const out: string[] = []
  for (const d = new Date(desde); d <= hasta; d.setUTCDate(d.getUTCDate() + 1)) out.push(keyUTC(d))
  return out
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const num = (k: string, def: number) => {
    const v = Number(searchParams.get(k))
    return Number.isFinite(v) ? v : def
  }
  const ahora = new Date()
  let y0 = num('year',  ahora.getFullYear())
  let m0 = num('month', ahora.getMonth())           // 0-based
  // Rango: fin opcional (si no viene, = mes inicial)
  let y1 = num('endYear',  y0)
  let m1 = num('endMonth', m0)
  m0 = Math.min(Math.max(m0, 0), 11)
  m1 = Math.min(Math.max(m1, 0), 11)
  // Asegurar inicio <= fin
  if (y1 * 12 + m1 < y0 * 12 + m0) { [y0, y1] = [y1, y0]; [m0, m1] = [m1, m0] }

  const tenantId    = getActiveTenantId()
  const inicioRango = new Date(Date.UTC(y0, m0, 1))
  const finRango    = new Date(Date.UTC(y1, m1 + 1, 0, 23, 59, 59))

  const todos = await prisma.evento.findMany({
    where: {
      estado: { not: 'CANCELADO' },
      ...(tenantId ? { tenants: { some: { tenantId } } } : {}),
    },
    select: { id: true, nombre: true, fechaInicio: true, fechaFin: true, montajeInicio: true, desmontajeFin: true },
    orderBy: { fechaInicio: 'asc' },
  })

  const eventos = todos.filter(ev => {
    const desde = new Date(ev.montajeInicio ?? ev.fechaInicio)
    const hasta = new Date(ev.desmontajeFin ?? ev.fechaFin)
    return desde <= finRango && hasta >= inicioRango
  })

  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Gantt', { views: [{ state: 'frozen', xSplit: 5, ySplit: 3 }] })

  const FIJAS = ['Evento', 'Montaje', 'Inicio', 'Fin', 'Desmontaje']

  // Columnas de día: del montaje más temprano al desmontaje más tardío (dentro del rango pedido, ampliado por los eventos)
  let minD = inicioRango, maxD = finRango
  for (const ev of eventos) {
    const d1 = new Date(ev.montajeInicio ?? ev.fechaInicio)
    const d2 = new Date(ev.desmontajeFin ?? ev.fechaFin)
    if (d1 < minD) minD = d1
    if (d2 > maxD) maxD = d2
  }
  const MAX_DIAS = 400
  const dias: Date[] = []
  for (const d = new Date(Date.UTC(minD.getUTCFullYear(), minD.getUTCMonth(), minD.getUTCDate())); d <= maxD && dias.length < MAX_DIAS; d.setUTCDate(d.getUTCDate() + 1)) {
    dias.push(new Date(d))
  }
  const col0     = FIJAS.length + 1            // primera columna de día (1-based)
  const totalCols = FIJAS.length + dias.length

  // --- Fila 1: título ---
  ws.mergeCells(1, 1, 1, Math.max(totalCols, 1))
  const titulo = ws.getCell(1, 1)
  const rango  = (y0 === y1 && m0 === m1)
    ? `${MESES[m0]} ${y0}`
    : `${MESES[m0]} ${y0} — ${MESES[m1]} ${y1}`
  titulo.value = `Calendario de eventos — ${rango}`
  titulo.font  = { bold: true, size: 14, color: { argb: 'FF111827' } }
  titulo.alignment = { vertical: 'middle' }
  ws.getRow(1).height = 22

  // --- Filas 2-3: encabezados fijos (merge vertical) + banda de mes (fila 2) + días (fila 3) ---
  FIJAS.forEach((t, i) => {
    ws.mergeCells(2, i + 1, 3, i + 1)
    const c = ws.getCell(2, i + 1)
    c.value = t
    c.font = { bold: true, size: 10, color: { argb: 'FF374151' } }
    c.alignment = { vertical: 'middle' }
  })

  // Banda de mes: agrupa columnas de día por (año, mes)
  let iniRun = 0
  for (let i = 1; i <= dias.length; i++) {
    const cambia = i === dias.length ||
      dias[i].getUTCMonth() !== dias[iniRun].getUTCMonth() ||
      dias[i].getUTCFullYear() !== dias[iniRun].getUTCFullYear()
    if (cambia) {
      const cIni = col0 + iniRun
      const cFin = col0 + i - 1
      if (cFin >= cIni) ws.mergeCells(2, cIni, 2, cFin)
      const banda = ws.getCell(2, cIni)
      banda.value = `${MESES[dias[iniRun].getUTCMonth()]} ${dias[iniRun].getUTCFullYear()}`
      banda.font  = { bold: true, size: 9, color: { argb: 'FF374151' } }
      banda.alignment = { horizontal: 'center', vertical: 'middle' }
      banda.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_BANDA } }
      iniRun = i
    }
  }

  // Fila 3: día (letra + número)
  dias.forEach((d, i) => {
    const c = ws.getCell(3, col0 + i)
    const finde = d.getUTCDay() === 0 || d.getUTCDay() === 6
    c.value = `${DIA_LETRA[d.getUTCDay()]}${d.getUTCDate()}`
    c.font = { bold: true, size: 8, color: { argb: finde ? 'FF9CA3AF' : 'FF374151' } }
    c.alignment = { textRotation: 90, horizontal: 'center', vertical: 'middle' }
    if (finde) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_FINDE } }
  })
  ws.getRow(3).height = 44

  // --- Filas de eventos (desde la fila 4) ---
  eventos.forEach((ev, r) => {
    const row = ws.getRow(4 + r)
    const inicio = new Date(ev.fechaInicio)
    const fin    = new Date(ev.fechaFin)
    const setEvento     = new Set(diasEntre(inicio, fin))
    const setMontaje    = new Set<string>()
    const setDesmontaje = new Set<string>()
    if (ev.montajeInicio) {
      const h = new Date(inicio); h.setUTCDate(h.getUTCDate() - 1)
      const d = new Date(ev.montajeInicio)
      if (d <= h) diasEntre(d, h).forEach(k => setMontaje.add(k))
    }
    if (ev.desmontajeFin) {
      const d = new Date(fin); d.setUTCDate(d.getUTCDate() + 1)
      const h = new Date(ev.desmontajeFin)
      if (d <= h) diasEntre(d, h).forEach(k => setDesmontaje.add(k))
    }

    row.getCell(1).value = ev.nombre
    row.getCell(1).font  = { size: 10, color: { argb: 'FF111827' } }
    ;[fmt(ev.montajeInicio), fmt(ev.fechaInicio), fmt(ev.fechaFin), fmt(ev.desmontajeFin)].forEach((v, i) => {
      const c = row.getCell(2 + i)
      c.value = v
      c.font = { size: 9, color: { argb: 'FF6B7280' } }
      c.alignment = { horizontal: 'center' }
    })

    dias.forEach((d, i) => {
      const c   = row.getCell(col0 + i)
      const k   = keyUTC(d)
      const col = setEvento.has(k) ? C_EVENTO
        : setMontaje.has(k) ? C_MONTAJE
        : setDesmontaje.has(k) ? C_DESMONTAJE
        : (d.getUTCDay() === 0 || d.getUTCDay() === 6) ? C_FINDE : null
      if (col) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: col } }
    })
  })

  // Bordes finos + anchos
  const ultimaFila = 3 + eventos.length
  for (let r = 2; r <= Math.max(ultimaFila, 3); r++) {
    for (let cc = 1; cc <= totalCols; cc++) {
      ws.getCell(r, cc).border = {
        top:    { style: 'thin', color: { argb: C_BORDE } },
        bottom: { style: 'thin', color: { argb: C_BORDE } },
        left:   { style: 'thin', color: { argb: C_BORDE } },
        right:  { style: 'thin', color: { argb: C_BORDE } },
      }
    }
  }
  ws.getColumn(1).width = 30
  for (let i = 2; i <= FIJAS.length; i++) ws.getColumn(i).width = 12
  for (let i = col0; i <= totalCols; i++) ws.getColumn(i).width = 3.4

  // Leyenda al pie
  const legendRow = ultimaFila + 2
  const leyenda: [string, string][] = [['Montaje', C_MONTAJE], ['Evento', C_EVENTO], ['Desmontaje', C_DESMONTAJE]]
  leyenda.forEach(([txt, col], i) => {
    ws.getCell(legendRow, 1 + i * 2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: col } }
    const lbl = ws.getCell(legendRow, 2 + i * 2)
    lbl.value = txt
    lbl.font  = { size: 9, color: { argb: 'FF374151' } }
  })

  if (eventos.length === 0) {
    ws.getCell(4, 1).value = 'Sin eventos en el rango seleccionado.'
    ws.getCell(4, 1).font  = { italic: true, color: { argb: 'FF9CA3AF' } }
  }

  const buf = await wb.xlsx.writeBuffer()
  const sufijo = (y0 === y1 && m0 === m1) ? `${MESES[m0]}-${y0}` : `${MESES[m0]}${y0}-a-${MESES[m1]}${y1}`
  return new NextResponse(new Uint8Array(buf as ArrayBuffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="Calendario-Gantt-${sufijo}.xlsx"`,
    },
  })
}

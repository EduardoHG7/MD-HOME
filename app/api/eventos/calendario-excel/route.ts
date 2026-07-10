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
const C_BORDE      = 'FFE5E7EB'

// Clave UTC YYYY-MM-DD de una fecha
const keyUTC = (d: Date) =>
  `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
const fmt = (s: string | Date | null) => {
  if (!s) return '—'
  const d = new Date(s)
  return `${d.getUTCDate()}/${d.getUTCMonth() + 1}/${d.getUTCFullYear()}`
}

// Días (claves UTC) que abarca un rango inclusivo [desde, hasta]
function diasEntre(desde: Date, hasta: Date): string[] {
  const out: string[] = []
  for (const d = new Date(desde); d <= hasta; d.setUTCDate(d.getUTCDate() + 1)) out.push(keyUTC(d))
  return out
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const year  = Number(searchParams.get('year'))  || new Date().getFullYear()
  const month = Number(searchParams.get('month'))  // 0-based
  const mes   = Number.isInteger(month) && month >= 0 && month <= 11 ? month : new Date().getMonth()

  const tenantId = getActiveTenantId()
  const inicioMes = new Date(Date.UTC(year, mes, 1))
  const finMes    = new Date(Date.UTC(year, mes + 1, 0, 23, 59, 59))

  const todos = await prisma.evento.findMany({
    where: {
      estado: { not: 'CANCELADO' },
      ...(tenantId ? { tenants: { some: { tenantId } } } : {}),
    },
    select: { id: true, nombre: true, fechaInicio: true, fechaFin: true, montajeInicio: true, desmontajeFin: true },
    orderBy: { fechaInicio: 'asc' },
  })

  // Eventos cuyo tramo (montaje→desmontaje) toca el mes visible
  const eventos = todos.filter(ev => {
    const desde = new Date(ev.montajeInicio ?? ev.fechaInicio)
    const hasta = new Date(ev.desmontajeFin ?? ev.fechaFin)
    return desde <= finMes && hasta >= inicioMes
  })

  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Gantt', { views: [{ state: 'frozen', xSplit: 5, ySplit: 2 }] })

  const FIJAS = ['Evento', 'Montaje', 'Inicio', 'Fin', 'Desmontaje']

  // Rango de columnas de días: del montaje más temprano al desmontaje más tardío
  let minD = inicioMes, maxD = finMes
  for (const ev of eventos) {
    const d1 = new Date(ev.montajeInicio ?? ev.fechaInicio)
    const d2 = new Date(ev.desmontajeFin ?? ev.fechaFin)
    if (d1 < minD) minD = d1
    if (d2 > maxD) maxD = d2
  }
  // Tope de seguridad: máximo 186 columnas de día
  const MAX_DIAS = 186
  const dias: Date[] = []
  for (const d = new Date(Date.UTC(minD.getUTCFullYear(), minD.getUTCMonth(), minD.getUTCDate())); d <= maxD && dias.length < MAX_DIAS; d.setUTCDate(d.getUTCDate() + 1)) {
    dias.push(new Date(d))
  }

  const totalCols = FIJAS.length + dias.length

  // Fila 1: título
  ws.mergeCells(1, 1, 1, Math.max(totalCols, 1))
  const titulo = ws.getCell(1, 1)
  titulo.value = `Calendario de eventos — ${MESES[mes]} ${year}`
  titulo.font  = { bold: true, size: 14, color: { argb: 'FF111827' } }
  titulo.alignment = { vertical: 'middle' }
  ws.getRow(1).height = 22

  // Fila 2: encabezados
  const hdr = ws.getRow(2)
  FIJAS.forEach((t, i) => {
    const c = hdr.getCell(i + 1)
    c.value = t
    c.font = { bold: true, size: 10, color: { argb: 'FF374151' } }
    c.alignment = { vertical: 'middle' }
  })
  dias.forEach((d, i) => {
    const c = hdr.getCell(FIJAS.length + 1 + i)
    const finde = d.getUTCDay() === 0 || d.getUTCDay() === 6
    c.value = `${DIA_LETRA[d.getUTCDay()]}${d.getUTCDate()}`
    c.font = { bold: true, size: 8, color: { argb: finde ? 'FF9CA3AF' : 'FF374151' } }
    c.alignment = { textRotation: 90, horizontal: 'center', vertical: 'middle' }
    if (finde) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_FINDE } }
  })
  hdr.height = 46

  // Filas de eventos
  eventos.forEach((ev, r) => {
    const rowN = 3 + r
    const row  = ws.getRow(rowN)

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
      const c   = row.getCell(FIJAS.length + 1 + i)
      const k   = keyUTC(d)
      const col = setEvento.has(k) ? C_EVENTO
        : setMontaje.has(k) ? C_MONTAJE
        : setDesmontaje.has(k) ? C_DESMONTAJE
        : (d.getUTCDay() === 0 || d.getUTCDay() === 6) ? C_FINDE : null
      if (col) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: col } }
    })
  })

  // Bordes finos en toda la grilla + anchos de columna
  const ultimaFila = 2 + eventos.length
  for (let r = 2; r <= Math.max(ultimaFila, 2); r++) {
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
  for (let i = FIJAS.length + 1; i <= totalCols; i++) ws.getColumn(i).width = 3.4

  // Leyenda al pie
  const legendRow = ultimaFila + 2
  const leyenda: [string, string][] = [['Montaje', C_MONTAJE], ['Evento', C_EVENTO], ['Desmontaje', C_DESMONTAJE]]
  leyenda.forEach(([txt, col], i) => {
    const chip = ws.getCell(legendRow, 1 + i * 2)
    chip.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: col } }
    const lbl = ws.getCell(legendRow, 2 + i * 2)
    lbl.value = txt
    lbl.font  = { size: 9, color: { argb: 'FF374151' } }
  })

  if (eventos.length === 0) {
    ws.getCell(3, 1).value = 'Sin eventos en este mes.'
    ws.getCell(3, 1).font  = { italic: true, color: { argb: 'FF9CA3AF' } }
  }

  const buf = await wb.xlsx.writeBuffer()
  const nombreArchivo = `Calendario-Gantt-${MESES[mes]}-${year}.xlsx`
  return new NextResponse(new Uint8Array(buf as ArrayBuffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${nombreArchivo}"`,
    },
  })
}

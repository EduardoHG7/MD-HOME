export const dynamic = 'force-dynamic'
export const maxDuration = 30

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getConsolidadoAsignados } from '@/lib/asignados'
import ExcelJS from 'exceljs'

const C_HEADER = 'FF111827'
const C_TOTAL  = 'FFF3F4F6'
const C_ALERTA = 'FFFEF3C7' // ámbar claro: escaneó menos de lo asignado
const C_BORDE  = 'FFE5E7EB'
const money = (n: number | null) => (n === null ? '' : n)

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role === 'APLICANTE') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const data = await getConsolidadoAsignados(params.id, {
    solicito: searchParams.get('solicito') || undefined,
    funcion:  searchParams.get('funcion')  || undefined,
  })
  if (!data) return NextResponse.json({ error: 'Evento no encontrado' }, { status: 404 })

  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Asignados', { views: [{ state: 'frozen', ySplit: 3 }] })

  const cols = [
    { h: 'Aplicante',        w: 26 },
    { h: 'Cédula',           w: 14 },
    { h: 'Función',          w: 18 },
    { h: 'Solicitado por',   w: 20 },
    { h: 'Tarifa',           w: 12 },
    { h: '$/día',            w: 10 },
    { h: 'Días asignados',   w: 13 },
    { h: 'Días escaneados',  w: 14 },
    { h: 'Horas (por día)',  w: 34 },
    { h: 'A pagar (asignados)',  w: 17 },
    { h: 'A pagar (escaneados)', w: 18 },
    { h: 'Banco',            w: 18 },
    { h: 'Tipo de cuenta',   w: 14 },
    { h: 'N° de cuenta',     w: 20 },
  ]
  const total = cols.length

  // Título
  ws.mergeCells(1, 1, 1, total)
  const t = ws.getCell(1, 1)
  t.value = `Asignados — ${data.evento.nombre}`
  t.font  = { bold: true, size: 14, color: { argb: C_HEADER } }
  ws.getRow(1).height = 22

  // Encabezados (fila 3, fila 2 vacía de separación)
  const hdr = ws.getRow(3)
  cols.forEach((c, i) => {
    const cell = hdr.getCell(i + 1)
    cell.value = c.h
    cell.font  = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } }
    cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_HEADER } }
    cell.alignment = { vertical: 'middle', wrapText: true }
    ws.getColumn(i + 1).width = c.w
  })
  hdr.height = 28

  // Filas
  data.filas.forEach((f, r) => {
    const row = ws.getRow(4 + r)
    const horas = f.dias.length
      ? f.dias.map(d => `${d.fecha} ${d.entrada ?? '—'}-${d.salida ?? '—'}`).join('  |  ')
      : 'Sin escaneos'
    const vals = [
      f.nombre, f.cedula, f.funcion, f.solicitante, f.tarifaTipo ?? '—',
      money(f.precioPorDia), f.diasAsignados ?? '—', f.diasEscaneados, horas,
      money(f.montoAsignado), money(f.montoEscaneado),
      f.banco ?? '—', f.tipoCuenta ?? '—', f.cuentaBancaria,
    ]
    vals.forEach((v, i) => {
      const cell = row.getCell(i + 1)
      cell.value = v as string | number
      cell.font  = { size: 9 }
      if (i >= 5) cell.alignment = { horizontal: 'center' }
    })
    // formato moneda en $/día y montos
    ;[6, 10, 11].forEach(c => { row.getCell(c).numFmt = '"$"#,##0.00' })
    // alerta si escaneó menos días de los asignados
    if (f.diasAsignados !== null && f.diasEscaneados < f.diasAsignados) {
      row.getCell(8).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_ALERTA } }
    }
  })

  // Totales
  const totRow = 4 + data.filas.length
  const row = ws.getRow(totRow)
  row.getCell(1).value = `TOTAL (${data.totales.eventuales} eventuales)`
  row.getCell(1).font  = { bold: true, size: 10 }
  row.getCell(7).value  = data.totales.diasAsignados
  row.getCell(8).value  = data.totales.diasEscaneados
  row.getCell(10).value = data.totales.montoAsignado
  row.getCell(11).value = data.totales.montoEscaneado
  ;[7, 8, 10, 11].forEach(c => {
    row.getCell(c).font = { bold: true, size: 10 }
    row.getCell(c).alignment = { horizontal: 'center' }
  })
  ;[10, 11].forEach(c => { row.getCell(c).numFmt = '"$"#,##0.00' })
  for (let c = 1; c <= total; c++) row.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_TOTAL } }

  // Bordes
  for (let r = 3; r <= totRow; r++) {
    for (let c = 1; c <= total; c++) {
      ws.getCell(r, c).border = {
        top: { style: 'thin', color: { argb: C_BORDE } }, bottom: { style: 'thin', color: { argb: C_BORDE } },
        left: { style: 'thin', color: { argb: C_BORDE } }, right: { style: 'thin', color: { argb: C_BORDE } },
      }
    }
  }

  const buf = await wb.xlsx.writeBuffer()
  const safe = data.evento.nombre.replace(/[^a-zA-Z0-9-_ ]/g, '').trim().slice(0, 40) || 'evento'
  return new NextResponse(new Uint8Array(buf as ArrayBuffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="Asignados-${safe}.xlsx"`,
    },
  })
}

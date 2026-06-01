export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { facturas, eventoNombre } = await req.json()

  // Importar xlsx de forma dinámica (solo server-side)
  const XLSX = await import('xlsx')

  const rows = facturas.map((f: Record<string, unknown>) => ({
    'N° Factura':     f.numeroFactura ?? '',
    'Proveedor':      f.proveedor     ?? '',
    'RUC/DV':         f.rucDv         ?? '',
    'Descripción':    f.descripcion   ?? '',
    'Responsable':    f.responsable   ?? '',
    'F. Emisión':     f.fechaEmision  ?? '',
    'F. Pago':        f.fechaPago     ?? '',
    'Subtotal':       Number(f.subtotal) || 0,
    'ITBMS':          Number(f.itbms)    || 0,
    'Total':          Number(f.total)    || 0,
    'Archivo':        f.archivoNombre ?? '',
  }))

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(rows)

  // Ancho de columnas
  ws['!cols'] = [
    { wch: 12 }, { wch: 30 }, { wch: 20 }, { wch: 35 },
    { wch: 20 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
    { wch: 10 }, { wch: 12 }, { wch: 25 },
  ]

  XLSX.utils.book_append_sheet(wb, ws, 'Facturas')
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

  const fecha = new Date().toISOString().split('T')[0]
  const nombre = eventoNombre ? `Facturas_${eventoNombre}_${fecha}` : `Facturas_${fecha}`

  return new Response(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${nombre}.xlsx"`,
    },
  })
}

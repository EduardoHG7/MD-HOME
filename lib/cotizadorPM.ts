// Motor de cálculo del cotizador de Print Media — sin dependencias de
// servidor (prisma, etc.) para poder usarse igual en el cliente (vista
// previa en vivo) y en la API (snapshot autoritativo al guardar).

export type NivelPrecio = 'A' | 'B' | 'C'
export type FormulaProducto = 'AREA' | 'AREA_PERIMETRO'

export interface MaterialCalc {
  id: string
  costoUnitario: number
}

export interface RecetaCalc {
  materialId: string
  cantidadPorM2: number
  cantidadPorMetroPerimetro: number
}

export interface ProductoCalc {
  id: string
  formula: FormulaProducto
  manoObra: number
  margenA: number
  margenB: number
  margenC: number
  materiales: RecetaCalc[]
}

export interface ItemCalcInput {
  productoId?: string | null
  ancho?: number | null
  alto?: number | null
  cantidad: number
  incluido: boolean
  // Para ítems manuales (sin producto), el costo/precio se ingresan directo.
  costoUnitarioManual?: number
  precioUnitarioManual?: number
}

export function margenPorNivel(producto: ProductoCalc, nivel: NivelPrecio): number {
  return nivel === 'A' ? producto.margenA : nivel === 'C' ? producto.margenC : producto.margenB
}

export function precioDesdeCosto(costo: number, margenPct: number): number {
  const m = Math.min(Math.max(margenPct, 0), 95) / 100
  return m > 0 ? costo / (1 - m) : costo
}

// Costo unitario (por 1 unidad del ítem) calculado a partir de la receta del
// producto paramétrico y los costos de materiales vigentes.
export function calcularCostoUnitario(
  producto: ProductoCalc,
  materialesPorId: Record<string, MaterialCalc>,
  ancho: number,
  alto: number,
): number {
  const area = Math.max(ancho, 0) * Math.max(alto, 0)
  const perimetro = 2 * (Math.max(ancho, 0) + Math.max(alto, 0))
  let costoMateriales = 0
  for (const r of producto.materiales) {
    const material = materialesPorId[r.materialId]
    if (!material) continue
    costoMateriales += area * r.cantidadPorM2 * material.costoUnitario
    if (producto.formula === 'AREA_PERIMETRO') {
      costoMateriales += perimetro * r.cantidadPorMetroPerimetro * material.costoUnitario
    }
  }
  const costoManoObra = area * producto.manoObra
  return costoMateriales + costoManoObra
}

export function calcularItem(
  item: ItemCalcInput,
  nivel: NivelPrecio,
  productosPorId: Record<string, ProductoCalc>,
  materialesPorId: Record<string, MaterialCalc>,
): { costoUnitario: number; precioUnitario: number } {
  if (!item.productoId) {
    return {
      costoUnitario:  item.costoUnitarioManual  ?? 0,
      precioUnitario: item.precioUnitarioManual ?? 0,
    }
  }
  const producto = productosPorId[item.productoId]
  if (!producto) return { costoUnitario: 0, precioUnitario: 0 }
  const costoUnitario = calcularCostoUnitario(producto, materialesPorId, item.ancho ?? 0, item.alto ?? 0)
  const precioUnitario = precioDesdeCosto(costoUnitario, margenPorNivel(producto, nivel))
  return { costoUnitario, precioUnitario }
}

export interface ResumenCotizacion {
  costoItems:    number // costo de materiales + mano de obra de todos los ítems incluidos
  ventaItems:    number // precio de venta de todos los ítems incluidos
  transporte:    number
  indirectos:    number // % sobre costoItems
  costoTotal:    number // costoItems + transporte + indirectos
  montoVenta:    number // total a cobrar al cliente = ventaItems + transporte + indirectos (a costo)
  utilidadBruta: number // montoVenta - costoTotal
  margenPct:     number
}

export function calcularResumen(
  items: { costoUnitario: number; precioUnitario: number; cantidad: number; incluido: boolean }[],
  transporte: number,
  costosIndirectosPct: number,
): ResumenCotizacion {
  const incluidos = items.filter(i => i.incluido)
  const costoItems = incluidos.reduce((s, i) => s + i.costoUnitario  * i.cantidad, 0)
  const ventaItems = incluidos.reduce((s, i) => s + i.precioUnitario * i.cantidad, 0)
  const indirectos = costoItems * (costosIndirectosPct / 100)
  const costoTotal = costoItems + transporte + indirectos
  const montoVenta = ventaItems + transporte + indirectos
  const utilidadBruta = montoVenta - costoTotal
  const margenPct = montoVenta > 0 ? (utilidadBruta / montoVenta) * 100 : 0
  return { costoItems, ventaItems, transporte, indirectos, costoTotal, montoVenta, utilidadBruta, margenPct }
}

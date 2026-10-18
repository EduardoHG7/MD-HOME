import { prisma } from '@/lib/prisma'
import { publish } from '@/lib/events'
import { applyMapping, getMapping } from '@/lib/mapping'

// CodeREADr (y lectores similares) pueden mandar el resultado del escaneo
// como GET con query params, o como POST en JSON o form-urlencoded.
// Esta función junta todo en un solo objeto plano string -> string.
export async function parseIncomingPayload(req: Request): Promise<Record<string, string>> {
  const url = new URL(req.url)
  const payload: Record<string, string> = {}
  for (const [key, value] of url.searchParams.entries()) payload[key] = value

  if (req.method === 'POST') {
    const contentType = req.headers.get('content-type') || ''
    try {
      if (contentType.includes('application/json')) {
        const body = await req.json()
        if (body && typeof body === 'object') {
          for (const [key, value] of Object.entries(body)) {
            payload[key] = typeof value === 'string' ? value : JSON.stringify(value)
          }
        }
      } else if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
        const form = await req.formData()
        for (const [key, value] of form.entries()) {
          if (typeof value === 'string') payload[key] = value
        }
      } else {
        const text = await req.text()
        if (text) {
          // Intenta JSON primero, si no, lo guarda crudo bajo "body".
          try {
            const body = JSON.parse(text)
            if (body && typeof body === 'object') {
              for (const [key, value] of Object.entries(body)) {
                payload[key] = typeof value === 'string' ? value : JSON.stringify(value)
              }
            }
          } catch {
            payload.body = text
          }
        }
      }
    } catch {
      // Body vacío o ilegible: seguimos solo con los query params.
    }
  }

  return payload
}

const INVALID_HINTS = ['false', '0', 'no', 'invalid', 'invalido', 'inválido', 'fail', 'failed', 'rechazado', 'denied']

function looksInvalid(payload: Record<string, string>): boolean {
  for (const key of ['valid', 'status', 'result', 'resultado', 'estado', 'success']) {
    const raw = payload[key]
    if (raw === undefined) continue
    const value = raw.toString().trim().toLowerCase()
    if (INVALID_HINTS.includes(value)) return true
  }
  return false
}

export async function ingestScan(puntoId: string, puntoToken: string, payload: Record<string, string>) {
  const mapping = await getMapping()
  const mapped = applyMapping(payload, mapping)
  const estado = looksInvalid(payload) ? 'INVALIDO' : 'PENDIENTE'

  const boleto = await prisma.boleto.create({
    data: {
      puntoId,
      codigo: mapped.codigo,
      nombre: mapped.nombre,
      apellido: mapped.apellido,
      evento: mapped.evento,
      fecha: mapped.fecha,
      extra: JSON.stringify(mapped.extra),
      raw: JSON.stringify(payload),
      estado,
    },
  })

  if (estado === 'PENDIENTE') {
    publish(puntoToken, {
      id: boleto.id,
      codigo: boleto.codigo,
      nombre: boleto.nombre,
      apellido: boleto.apellido,
      evento: boleto.evento,
      fecha: boleto.fecha,
      extra: mapped.extra,
      createdAt: boleto.createdAt.toISOString(),
    })
  }

  return boleto
}

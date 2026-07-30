import { prisma } from '@/lib/prisma'

export type FieldMapping = {
  nombre: string
  apellido: string
  evento: string
  fecha: string
  codigo: string
}

export const EMPTY_MAPPING: FieldMapping = {
  nombre: '',
  apellido: '',
  evento: '',
  fecha: '',
  codigo: '',
}

const SETTING_KEY = 'mapping'

export async function getMapping(): Promise<FieldMapping> {
  const row = await prisma.setting.findUnique({ where: { key: SETTING_KEY } })
  if (!row) return EMPTY_MAPPING
  try {
    return { ...EMPTY_MAPPING, ...JSON.parse(row.value) }
  } catch {
    return EMPTY_MAPPING
  }
}

export async function saveMapping(mapping: FieldMapping): Promise<void> {
  await prisma.setting.upsert({
    where: { key: SETTING_KEY },
    create: { key: SETTING_KEY, value: JSON.stringify(mapping) },
    update: { value: JSON.stringify(mapping) },
  })
}

// Intenta adivinar el campo correcto probando varios nombres típicos que
// CodeREADr (u otros lectores) suelen usar, para que el mapeo funcione
// razonablemente incluso antes de configurarlo a mano.
const GUESSES: Record<keyof FieldMapping, string[]> = {
  nombre: ['nombre', 'name', 'firstname', 'first_name', 'field1'],
  apellido: ['apellido', 'lastname', 'last_name', 'surname', 'field2'],
  evento: ['evento', 'event', 'field3'],
  fecha: ['fecha', 'date', 'field4'],
  codigo: ['codigo', 'código', 'code', 'barcode', 'scan_ref', 'ref', 'list_key', 'key'],
}

function findKeyCaseInsensitive(payload: Record<string, string>, candidates: string[]): string | undefined {
  const lowerMap = new Map(Object.keys(payload).map((k) => [k.toLowerCase(), k]))
  for (const candidate of candidates) {
    const match = lowerMap.get(candidate.toLowerCase())
    if (match) return match
  }
  return undefined
}

export type MappedFields = {
  nombre?: string
  apellido?: string
  evento?: string
  fecha?: string
  codigo?: string
  extra: Record<string, string>
}

export function applyMapping(payload: Record<string, string>, mapping: FieldMapping): MappedFields {
  const used = new Set<string>()

  function resolve(configured: string, guessKey: keyof FieldMapping): string | undefined {
    if (configured && configured in payload) {
      used.add(configured)
      return payload[configured]
    }
    if (!configured) {
      const guessed = findKeyCaseInsensitive(payload, GUESSES[guessKey])
      if (guessed) {
        used.add(guessed)
        return payload[guessed]
      }
    }
    return undefined
  }

  const result: MappedFields = {
    nombre: resolve(mapping.nombre, 'nombre'),
    apellido: resolve(mapping.apellido, 'apellido'),
    evento: resolve(mapping.evento, 'evento'),
    fecha: resolve(mapping.fecha, 'fecha'),
    codigo: resolve(mapping.codigo, 'codigo'),
    extra: {},
  }

  for (const [key, value] of Object.entries(payload)) {
    if (!used.has(key)) result.extra[key] = value
  }

  return result
}

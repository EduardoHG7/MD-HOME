// Jornada laboral de 6am a 6am (hora de Panamá): un turno que pasa la
// medianoche cuenta como el día en que empezó. Panamá es UTC-5 fijo (sin
// horario de verano).
const OFFSET_PANAMA = 5   // UTC-5
const HORA_CORTE    = 6   // la jornada arranca a las 6am

// Clave YYYY-MM-DD de la jornada a la que pertenece un instante.
// Restar 6h y luego tomar la fecha local: un escaneo antes de las 6am cae en
// la fecha del día anterior (la jornada que venía corriendo).
export function claveJornada(ts: Date): string {
  const shifted = new Date(ts.getTime() - HORA_CORTE * 3600_000)
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Panama', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(shifted)
}

// Instante (UTC) en que empezó la jornada actual para un 'ahora' dado.
// Usado por el escáner para decidir entrada/salida dentro de la misma jornada.
export function inicioJornada(now: Date = new Date()): Date {
  // Campos UTC de este Date = hora local de Panamá
  const p = new Date(now.getTime() - OFFSET_PANAMA * 3600_000)
  let y = p.getUTCFullYear(), m = p.getUTCMonth(), d = p.getUTCDate()
  if (p.getUTCHours() < HORA_CORTE) {
    const prev = new Date(Date.UTC(y, m, d) - 86400_000)
    y = prev.getUTCFullYear(); m = prev.getUTCMonth(); d = prev.getUTCDate()
  }
  // 6am Panamá = (6 + 5) = 11:00 UTC
  return new Date(Date.UTC(y, m, d, HORA_CORTE + OFFSET_PANAMA, 0, 0))
}

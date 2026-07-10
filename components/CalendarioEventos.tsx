'use client'

import { useState } from 'react'

export interface EventoCalendario {
  id: string
  nombre: string
  fechaInicio: string
  fechaFin: string
  montajeInicio: string | null
  desmontajeFin: string | null
}

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const DIAS  = ['Do','Lu','Ma','Mi','Ju','Vi','Sá']

// Menú de descarga del Gantt: mes visible o rangos que arrancan en ese mes
function DescargarGantt({ year, month }: { year: number; month: number }) {
  const [abierto, setAbierto] = useState(false)

  const fin = (n: number) => {
    const t = month + (n - 1)
    return { y: year + Math.floor(t / 12), m: ((t % 12) + 12) % 12 }
  }
  const url = (n: number) => {
    const e = fin(n)
    return `/api/eventos/calendario-excel?year=${year}&month=${month}&endYear=${e.y}&endMonth=${e.m}`
  }
  const opciones: { n: number; label: string }[] = [
    { n: 1,  label: 'Solo este mes' },
    { n: 3,  label: 'Este mes + 2 (3 meses)' },
    { n: 6,  label: 'Este mes + 5 (6 meses)' },
    { n: 12, label: 'Este mes + 11 (12 meses)' },
  ]

  return (
    <div className="flex justify-end mb-2 relative">
      <button onClick={() => setAbierto(v => !v)}
        className="text-xs px-3 py-1.5 rounded-xl border-2 border-green-200 bg-green-50 text-green-700 hover:border-green-400 font-semibold transition-all"
        title="Descargar el calendario como Gantt en Excel">
        ⬇️ Excel (Gantt) ▾
      </button>
      {abierto && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setAbierto(false)} />
          <div className="absolute right-0 top-full mt-1 z-20 bg-white border border-gray-200 rounded-xl shadow-lg py-1 min-w-[200px]">
            {opciones.map(o => (
              <a key={o.n} href={url(o.n)} onClick={() => setAbierto(false)}
                className="block px-3 py-2 text-xs text-gray-700 hover:bg-green-50 hover:text-green-700">
                {o.label}
              </a>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export function CalendarioEventos({ eventos }: { eventos: EventoCalendario[] }) {
  const hoy = new Date()
  const [year,  setYear]  = useState(hoy.getFullYear())
  const [month, setMonth] = useState(hoy.getMonth())

  function cambiarMes(delta: number) {
    let m = month + delta
    let y = year
    if (m < 0)  { m = 11; y-- }
    if (m > 11) { m = 0;  y++ }
    setMonth(m); setYear(y)
  }

  const primerDia = new Date(year, month, 1).getDay()
  const diasEnMes = new Date(year, month + 1, 0).getDate()

  const diasEvento     = new Set<number>()
  const diasMontaje    = new Set<number>()
  const diasDesmontaje = new Set<number>()
  // Detalle por día para el tooltip: "Montaje Tini", "Evento Tini", etc.
  const detalleDia = new Map<number, { tipo: string; nombre: string }[]>()

  // Las fechas se guardan a medianoche UTC — usar día UTC para no correr un día en UTC-5
  const addDays = (set: Set<number>, desde: Date, hasta: Date, tipo: string, nombre: string) => {
    for (let d = new Date(desde); d <= hasta; d.setUTCDate(d.getUTCDate() + 1)) {
      if (d.getUTCFullYear() === year && d.getUTCMonth() === month) {
        const dia = d.getUTCDate()
        set.add(dia)
        if (!detalleDia.has(dia)) detalleDia.set(dia, [])
        detalleDia.get(dia)!.push({ tipo, nombre })
      }
    }
  }

  for (const ev of eventos) {
    const inicio = new Date(ev.fechaInicio)
    const fin    = new Date(ev.fechaFin)
    addDays(diasEvento, inicio, fin, 'Evento', ev.nombre)

    if (ev.montajeInicio) {
      const mDesde = new Date(ev.montajeInicio)
      const mHasta = new Date(inicio)
      mHasta.setUTCDate(mHasta.getUTCDate() - 1)
      if (mDesde <= mHasta) addDays(diasMontaje, mDesde, mHasta, 'Montaje', ev.nombre)
    }
    if (ev.desmontajeFin) {
      const dDesde = new Date(fin)
      dDesde.setUTCDate(dDesde.getUTCDate() + 1)
      const dHasta = new Date(ev.desmontajeFin)
      if (dDesde <= dHasta) addDays(diasDesmontaje, dDesde, dHasta, 'Desmontaje', ev.nombre)
    }
  }

  const TIPO_DOT: Record<string, string> = {
    Montaje: 'bg-red-500', Evento: 'bg-green-500', Desmontaje: 'bg-orange-400',
  }

  const esMesActual = year === hoy.getFullYear() && month === hoy.getMonth()

  // Eventos que tocan el mes visible (incluye montaje/desmontaje)
  const eventosDelMes = eventos.filter(ev => {
    const desde = new Date(ev.montajeInicio ?? ev.fechaInicio)
    const hasta = new Date(ev.desmontajeFin ?? ev.fechaFin)
    const inicioMes = new Date(Date.UTC(year, month, 1))
    const finMes    = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59))
    return desde <= finMes && hasta >= inicioMes
  })

  return (
    <div className="card p-5">
      {/* Descargar Gantt a Excel: mes visible o varios meses */}
      <DescargarGantt year={year} month={month} />

      {/* Header con navegación */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => cambiarMes(-1)}
          className="w-8 h-8 flex items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 transition-all"
          title="Mes anterior">‹</button>
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
            {MESES[month]} {year}
          </h2>
          {!esMesActual && (
            <button onClick={() => { setYear(hoy.getFullYear()); setMonth(hoy.getMonth()) }}
              className="text-xs text-blue-500 hover:underline">Hoy</button>
          )}
        </div>
        <button onClick={() => cambiarMes(1)}
          className="w-8 h-8 flex items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 transition-all"
          title="Mes siguiente">›</button>
      </div>

      {/* Cabecera días */}
      <div className="grid grid-cols-7 mb-1">
        {DIAS.map(d => (
          <div key={d} className="text-center text-xs text-gray-400 font-medium py-1">{d}</div>
        ))}
      </div>

      {/* Días */}
      <div className="grid grid-cols-7 gap-y-1">
        {Array.from({ length: primerDia }).map((_, i) => (
          <div key={`e-${i}`} />
        ))}
        {Array.from({ length: diasEnMes }).map((_, i) => {
          const dia      = i + 1
          const esHoyDia = esMesActual && dia === hoy.getDate()
          const color = diasEvento.has(dia)
            ? 'bg-green-500 text-white'
            : diasMontaje.has(dia)
              ? 'bg-red-500 text-white'
              : diasDesmontaje.has(dia)
                ? 'bg-orange-400 text-white'
                : 'text-gray-600 hover:bg-gray-50'
          const detalle = detalleDia.get(dia) ?? []
          return (
            <div key={dia} className="relative group flex items-center justify-center h-10">
              <div className={`w-8 h-8 flex items-center justify-center rounded-full text-sm font-medium transition-all
                ${color} ${esHoyDia ? 'ring-2 ring-gray-900 ring-offset-1' : ''}
              `}>
                {dia}
              </div>
              {detalle.length > 0 && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:block z-20 pointer-events-none">
                  <div className="bg-gray-900 text-white text-xs rounded-xl px-3 py-2 shadow-lg whitespace-nowrap space-y-1">
                    {detalle.map((d, i) => (
                      <div key={i} className="flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${TIPO_DOT[d.tipo] ?? 'bg-gray-400'}`} />
                        <span>{d.tipo} {d.nombre}</span>
                      </div>
                    ))}
                  </div>
                  <div className="w-2 h-2 bg-gray-900 rotate-45 mx-auto -mt-1" />
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Leyenda */}
      <div className="flex gap-3 flex-wrap mt-4 pt-4 border-t border-gray-100">
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <div className="w-3 h-3 rounded-full border-2 border-gray-900" /> Hoy
        </div>
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <div className="w-3 h-3 rounded-full bg-red-500" /> Montaje
        </div>
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <div className="w-3 h-3 rounded-full bg-green-500" /> Evento
        </div>
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <div className="w-3 h-3 rounded-full bg-orange-400" /> Desmontaje
        </div>
      </div>

      {/* Lista de eventos del mes visible */}
      {eventosDelMes.length > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-100 space-y-2">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Este mes</p>
          {eventosDelMes.map(ev => (
            <div key={ev.id} className="flex items-center gap-2 text-xs">
              <div className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
              <span className="text-gray-700 font-medium truncate">{ev.nombre}</span>
              <span className="text-gray-400 shrink-0 ml-auto">
                {new Date(ev.fechaInicio).getUTCDate()}/{new Date(ev.fechaInicio).getUTCMonth() + 1}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

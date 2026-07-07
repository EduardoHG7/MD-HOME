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

  // Las fechas se guardan a medianoche UTC — usar día UTC para no correr un día en UTC-5
  const addDays = (set: Set<number>, desde: Date, hasta: Date) => {
    for (let d = new Date(desde); d <= hasta; d.setUTCDate(d.getUTCDate() + 1)) {
      if (d.getUTCFullYear() === year && d.getUTCMonth() === month) set.add(d.getUTCDate())
    }
  }

  for (const ev of eventos) {
    const inicio = new Date(ev.fechaInicio)
    const fin    = new Date(ev.fechaFin)
    addDays(diasEvento, inicio, fin)

    if (ev.montajeInicio) {
      const mDesde = new Date(ev.montajeInicio)
      const mHasta = new Date(inicio)
      mHasta.setUTCDate(mHasta.getUTCDate() - 1)
      if (mDesde <= mHasta) addDays(diasMontaje, mDesde, mHasta)
    }
    if (ev.desmontajeFin) {
      const dDesde = new Date(fin)
      dDesde.setUTCDate(dDesde.getUTCDate() + 1)
      const dHasta = new Date(ev.desmontajeFin)
      if (dDesde <= dHasta) addDays(diasDesmontaje, dDesde, dHasta)
    }
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
          return (
            <div key={dia} className="flex items-center justify-center h-10">
              <div className={`w-8 h-8 flex items-center justify-center rounded-full text-sm font-medium transition-all
                ${color} ${esHoyDia ? 'ring-2 ring-gray-900 ring-offset-1' : ''}
              `}>
                {dia}
              </div>
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

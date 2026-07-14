export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { validateQRToken } from '@/lib/qr-token'
import { inicioJornada } from '@/lib/jornada'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const aid = searchParams.get('aid')  // applicant id
  const eid = searchParams.get('eid')  // event id
  const t   = searchParams.get('t')    // totp token

  if (!aid || !eid || !t) {
    return new NextResponse(scanPage('error', 'QR invÃ¡lido', ''), { headers: { 'Content-Type': 'text/html' } })
  }

  // Get applicant with their secret
  const aplicante = await prisma.aplicante.findUnique({ where: { id: aid } })
  if (!aplicante) {
    return new NextResponse(scanPage('error', 'Aplicante no encontrado', ''), { headers: { 'Content-Type': 'text/html' } })
  }

  // Validate TOTP token
  const secret = `${aplicante.qrSecret}-${eid}`
  const valid = validateQRToken(t, secret)
  if (!valid) {
    return new NextResponse(
      scanPage('error', 'QR Expirado o InvÃ¡lido', `El cÃ³digo QR de ${aplicante.nombreCompleto} ya expirÃ³. PÃ­dele que lo muestre de nuevo.`),
      { headers: { 'Content-Type': 'text/html' } }
    )
  }

  // Find assignment
  const asignacion = await prisma.asignacionAplicante.findUnique({
    where: { aplicanteId_eventoId: { aplicanteId: aid, eventoId: eid } },
    include: { evento: true },
  })
  if (!asignacion) {
    return new NextResponse(
      scanPage('error', 'Sin asignaciÃ³n', `${aplicante.nombreCompleto} no estÃ¡ asignado a este evento.`),
      { headers: { 'Content-Type': 'text/html' } }
    )
  }

  // Determine if this is ENTRADA or SALIDA (dentro de la jornada 6am–6am)
  const registrosHoy = await prisma.registroAsistencia.findMany({
    where: {
      asignacionId: asignacion.id,
      timestamp: { gte: inicioJornada() },
    },
    orderBy: { timestamp: 'asc' },
  })

  const tieneEntrada = registrosHoy.some(r => r.tipo === 'ENTRADA')
  const tieneSalida  = registrosHoy.some(r => r.tipo === 'SALIDA')

  let tipo: 'ENTRADA' | 'SALIDA'
  if (!tieneEntrada) {
    tipo = 'ENTRADA'
  } else if (!tieneSalida) {
    tipo = 'SALIDA'
  } else {
    return new NextResponse(
      scanPage('warning', 'Turno completo', `${aplicante.nombreCompleto} ya registrÃ³ entrada y salida hoy.`),
      { headers: { 'Content-Type': 'text/html' } }
    )
  }

  // Record attendance (token is unique per 30s window, prevents double-scan)
  try {
    await prisma.registroAsistencia.create({
      data: { asignacionId: asignacion.id, tipo, tokenUsado: t },
    })
  } catch {
    return new NextResponse(
      scanPage('warning', 'Ya registrado', `Este QR ya fue escaneado. Espera el prÃ³ximo cÃ³digo.`),
      { headers: { 'Content-Type': 'text/html' } }
    )
  }

  const hora = new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })
  return new NextResponse(
    scanPage('success', tipo === 'ENTRADA' ? 'âœ“ Entrada Registrada' : 'âœ“ Salida Registrada',
      `${aplicante.nombreCompleto}\nEvento: ${asignacion.evento.nombre}\nHora: ${hora}`),
    { headers: { 'Content-Type': 'text/html' } }
  )
}

function scanPage(type: 'success' | 'error' | 'warning', title: string, body: string): string {
  const colors = {
    success: { bg: '#14532d', border: '#16a34a', text: '#4ade80', icon: 'âœ“' },
    error:   { bg: '#4c0519', border: '#dc2626', text: '#f87171', icon: 'âœ—' },
    warning: { bg: '#713f12', border: '#d97706', text: '#fbbf24', icon: 'âš ' },
  }
  const c = colors[type]
  const lines = body.split('\n').map(l => `<p style="margin:4px 0;color:#e2e8f0;">${l}</p>`).join('')
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Magic Dreams Staff</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #0f0a1e; min-height: 100vh; display: flex; align-items: center; justify-content: center; font-family: system-ui, sans-serif; padding: 20px; }
    .card { background: ${c.bg}; border: 2px solid ${c.border}; border-radius: 20px; padding: 40px 32px; text-align: center; max-width: 400px; width: 100%; }
    .icon { font-size: 64px; color: ${c.text}; margin-bottom: 16px; }
    .title { font-size: 24px; font-weight: 700; color: ${c.text}; margin-bottom: 16px; }
    .brand { font-size: 13px; color: #6b7280; margin-top: 24px; }
    .brand span { color: #f59e0b; font-weight: 600; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${c.icon}</div>
    <div class="title">${title}</div>
    ${lines}
    <div class="brand"><span>Magic Dreams</span> Staff Â· Sistema de Asistencia</div>
  </div>
</body>
</html>`
}


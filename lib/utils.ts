import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: Date | string): string {
  return format(new Date(date), "d 'de' MMMM yyyy", { locale: es })
}

export function formatDateTime(date: Date | string): string {
  return format(new Date(date), "d MMM yyyy, HH:mm", { locale: es })
}

export function formatTime(date: Date | string): string {
  return format(new Date(date), 'HH:mm', { locale: es })
}

export function formatCurrency(amount: number): string {
  return `$${amount.toFixed(2)}`
}

export const TARIFA_LABELS: Record<string, string> = {
  DIARIA: 'Tarifa Diaria',
  QUINCENAL: 'Tarifa Quincenal',
  MENSUAL: 'Tarifa Mensual',
}

export const ESTADO_SOLICITUD_LABELS: Record<string, string> = {
  PENDIENTE: 'Pendiente',
  APROBADA: 'Aprobada',
  RECHAZADA: 'Rechazada',
}

export const ESTADO_COLORS: Record<string, string> = {
  PENDIENTE: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  APROBADA:  'bg-green-500/20 text-green-400 border-green-500/30',
  RECHAZADA: 'bg-red-500/20 text-red-400 border-red-500/30',
  ACTIVA:    'bg-blue-500/20 text-blue-400 border-blue-500/30',
  COMPLETADA:'bg-gray-500/20 text-gray-400 border-gray-500/30',
}

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
  PENDIENTE: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  APROBADA:  'bg-green-50 text-green-700 border-green-200',
  RECHAZADA: 'bg-red-50 text-red-700 border-red-200',
  ACTIVA:    'bg-blue-50 text-blue-700 border-blue-200',
  COMPLETADA:'bg-gray-50 text-gray-600 border-gray-200',
}

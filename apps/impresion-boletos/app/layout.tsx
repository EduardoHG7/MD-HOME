import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Impresión de Boletos',
  description: 'Impresión automática de boletos QR validados por CodeREADr',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  )
}

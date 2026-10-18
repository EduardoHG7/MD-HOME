import Link from 'next/link'
import LogoutButton from './LogoutButton'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-white/10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <span className="font-semibold text-white">🎫 Impresión de Boletos</span>
            <nav className="flex gap-4 text-sm text-gray-300">
              <Link href="/admin" className="hover:text-white">
                Resumen
              </Link>
              <Link href="/admin/puntos" className="hover:text-white">
                Puntos de impresión
              </Link>
              <Link href="/admin/mapeo" className="hover:text-white">
                Mapeo de campos
              </Link>
            </nav>
          </div>
          <LogoutButton />
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 py-6">{children}</main>
    </div>
  )
}

'use client'

export function ReporteFrame({ html }: { html: string }) {
  return (
    <iframe
      srcDoc={html}
      title="Conciliación Showare vs Bancos"
      className="w-full border-0 rounded-2xl"
      style={{ height: 'calc(100vh - 8rem)' }}
    />
  )
}

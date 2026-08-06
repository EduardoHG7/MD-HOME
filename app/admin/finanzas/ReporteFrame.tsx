// No es Client Component a propósito: el iframe no necesita nada
// interactivo de React, y el html puede pesar varios MB (crece a diario) —
// pasarlo como prop de un Client Component obliga a React a serializarlo
// por el protocolo RSC, que es mucho más frágil con strings gigantes que
// mandarlo directo como HTML del servidor.
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

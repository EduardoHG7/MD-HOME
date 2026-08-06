export default function LoadingFinanzas() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-gray-900" />
      <div>
        <p className="text-gray-900 font-medium">Cargando Finanzas…</p>
        <p className="text-gray-500 text-sm mt-1">Descargando y procesando el reporte desde SharePoint, puede tardar unos segundos.</p>
      </div>
    </div>
  )
}

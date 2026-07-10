'use client'

import { useParams } from 'next/navigation'
import { ExpedienteDocumentos } from '@/components/ExpedienteDocumentos'

// Expediente de documentos para usuarios (Panatickets): suben todo,
// la firma del contrato queda al gerente general.
export default function DocumentosEventoUsuarioPage() {
  const { id } = useParams<{ id: string }>()
  return (
    <ExpedienteDocumentos
      eventoId={id}
      puedeFirmar={false}
      basePath={`/usuario/documentos/${id}`}
      volverHref="/usuario/documentos"
    />
  )
}

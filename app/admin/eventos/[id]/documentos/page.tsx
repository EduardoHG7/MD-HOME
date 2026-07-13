'use client'

import { useParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { ExpedienteDocumentos } from '@/components/ExpedienteDocumentos'

export default function DocumentosEventoPage() {
  const { id } = useParams<{ id: string }>()
  const { data: session } = useSession()
  // Solo el admin/gerente firma; el operador Panatickets sube todo menos la firma
  const puedeFirmar = session?.user?.role === 'ADMIN'
  return (
    <ExpedienteDocumentos
      eventoId={id}
      puedeFirmar={puedeFirmar}
      basePath={`/admin/eventos/${id}`}
      volverHref="/admin/eventos"
    />
  )
}

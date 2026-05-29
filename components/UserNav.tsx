'use client'

import { signOut } from 'next-auth/react'
import { Session } from 'next-auth'
import Image from 'next/image'

export function UserNav({ session }: { session: Session }) {
  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
        <Image
          src="/logo.png"
          alt="Magic Dreams Productions"
          width={130}
          height={65}
          className="object-contain"
          priority
        />
        <div className="flex items-center gap-4">
          <span className="text-gray-500 text-sm hidden sm:block">
            {session.user?.name ?? session.user?.email}
          </span>
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="btn-ghost text-sm py-1.5"
          >
            Salir
          </button>
        </div>
      </div>
    </header>
  )
}

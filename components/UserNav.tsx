'use client'

import { signOut } from 'next-auth/react'
import { Session } from 'next-auth'

export function UserNav({ session }: { session: Session }) {
  return (
    <header className="border-b border-brand-800/40 backdrop-blur-sm bg-brand-950/60">
      <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-brand-800/60 border border-gold-500/40 flex items-center justify-center text-base">
            ✨
          </div>
          <span className="font-bold text-white text-sm">Magic Dreams Staff</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-brand-400 text-sm hidden sm:block">
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

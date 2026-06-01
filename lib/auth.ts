import { NextAuthOptions } from 'next-auth'
import AzureADProvider from 'next-auth/providers/azure-ad'
import CredentialsProvider from 'next-auth/providers/credentials'
import { compare } from 'bcryptjs'
import { prisma } from './prisma'

export const authOptions: NextAuthOptions = {
  providers: [
    AzureADProvider({
      clientId:     process.env.AZURE_AD_CLIENT_ID!,
      clientSecret: process.env.AZURE_AD_CLIENT_SECRET!,
      tenantId:     process.env.AZURE_AD_TENANT_ID!,
    }),

    CredentialsProvider({
      id:   'aplicante-credentials',
      name: 'Aplicante',
      credentials: {
        cedula:   { label: 'Cédula',      type: 'text' },
        password: { label: 'Contraseña',  type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.cedula || !credentials?.password) return null

        const aplicante = await prisma.aplicante.findUnique({
          where: { cedula: credentials.cedula.trim() },
        })
        if (!aplicante || !aplicante.passwordHash) return null

        const valid = await compare(credentials.password, aplicante.passwordHash)
        if (!valid) return null

        return {
          id:    aplicante.id,
          name:  aplicante.nombreCompleto,
          email: aplicante.email,
          role:  'APLICANTE',
        } as never
      },
    }),
  ],

  callbacks: {
    async signIn({ account }) {
      // Login de aplicante via credentials — no tocar tabla users
      if (account?.provider === 'aplicante-credentials') return true

      // Login Microsoft (admin/usuario)
      return true
    },

    async jwt({ token, user, account }) {
      if (user) {
        token.role = (user as { role?: string }).role
      }
      // Para Microsoft: guardar/actualizar usuario en BD
      if (account?.provider === 'azure-ad' && token.email) {
        try {
          const dbUser = await prisma.user.upsert({
            where:  { email: token.email as string },
            update: { name: token.name },
            create: {
              email: token.email as string,
              name:  token.name,
              role:  token.email === process.env.ADMIN_EMAIL ? 'ADMIN' : 'USER',
            },
          })
          token.role = dbUser.role
          token.dbId = dbUser.id
        } catch { /* ignore */ }
      }
      return token
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.role = (token.role as string) as 'ADMIN' | 'USER' | 'APLICANTE'
        session.user.id   = (token.dbId as string) ?? (token.sub ?? '')
      }
      return session
    },
  },

  pages: {
    signIn: '/login',
    error:  '/login',
  },
  session: { strategy: 'jwt' },
}

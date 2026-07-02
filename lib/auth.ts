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
      if (account?.provider === 'aplicante-credentials') return true
      return true
    },

    async jwt({ token, user, account }) {
      if (user) {
        token.role = (user as { role?: string }).role
      }

      if (account?.provider === 'azure-ad' && token.email) {
        try {
          const dbUser = await prisma.user.upsert({
            where:  { email: token.email as string },
            update: { name: token.name },
            create: {
              email:        token.email as string,
              name:         token.name,
              role:         token.email === process.env.ADMIN_EMAIL ? 'ADMIN' : 'USER',
              isSuperAdmin: token.email === process.env.ADMIN_EMAIL,
            },
            include: { tenants: { include: { tenant: true } } },
          })

          token.role         = dbUser.role
          token.dbId         = dbUser.id
          token.isSuperAdmin = dbUser.isSuperAdmin

          // Build available tenants list
          token.availableTenants = dbUser.tenants.map(ut => ({
            id:   ut.tenant.id,
            slug: ut.tenant.slug,
            nombre: ut.tenant.nombre,
            logo: ut.tenant.logo,
            role: ut.role,
          }))

          // If super-admin and no tenants assigned, load all tenants
          if (dbUser.isSuperAdmin && dbUser.tenants.length === 0) {
            const allTenants = await prisma.tenant.findMany({ where: { activo: true } })
            token.availableTenants = allTenants.map(t => ({
              id: t.id, slug: t.slug, nombre: t.nombre, logo: t.logo, role: 'ADMIN',
            }))
          }
        } catch { /* ignore */ }
      }

      return token
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.role          = (token.role as string) as 'ADMIN' | 'USER' | 'CONTABILIDAD' | 'APLICANTE'
        session.user.id            = (token.dbId as string) ?? (token.sub ?? '')
        session.user.isSuperAdmin  = (token.isSuperAdmin as boolean) ?? false
        session.user.availableTenants = (token.availableTenants as never[]) ?? []
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

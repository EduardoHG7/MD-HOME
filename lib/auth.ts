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

      // For aplicante logins, skip DB lookup
      if (token.role === 'APLICANTE') return token

      // Always reload from DB for Microsoft users (keeps tenants fresh)
      if (token.email && token.role !== 'APLICANTE') {
        try {
          const dbUser = await prisma.user.findUnique({
            where: { email: token.email as string },
            include: { tenants: { include: { tenant: { select: { id: true, slug: true, nombre: true, logo: true, activo: true } } } } },
          })

          if (!dbUser && account?.provider === 'azure-ad') {
            // First login ever — create the user
            const created = await prisma.user.create({
              data: {
                email:        token.email as string,
                name:         token.name,
                role:         token.email === process.env.ADMIN_EMAIL ? 'ADMIN' : 'USER',
                isSuperAdmin: token.email === process.env.ADMIN_EMAIL,
              },
              include: { tenants: { include: { tenant: true } } },
            })
            token.role         = created.role
            token.dbId         = created.id
            token.isSuperAdmin = created.isSuperAdmin
            token.availableTenants = []
          } else if (dbUser) {
            // Update name on each login
            if (account?.provider === 'azure-ad' && token.name) {
              await prisma.user.update({ where: { id: dbUser.id }, data: { name: token.name } })
            }
            token.role         = dbUser.role
            token.dbId         = dbUser.id
            token.isSuperAdmin = dbUser.isSuperAdmin

            const activeTenants = dbUser.tenants
              .filter(ut => ut.tenant.activo)
              .map(ut => ({ id: ut.tenant.id, slug: ut.tenant.slug, nombre: ut.tenant.nombre, logo: ut.tenant.logo, role: ut.role }))

            // Super-admin with no explicit assignments sees all tenants
            if (dbUser.isSuperAdmin && activeTenants.length === 0) {
              const all = await prisma.tenant.findMany({ where: { activo: true } })
              token.availableTenants = all.map(t => ({ id: t.id, slug: t.slug, nombre: t.nombre, logo: t.logo, role: 'ADMIN' }))
            } else {
              token.availableTenants = activeTenants
            }
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

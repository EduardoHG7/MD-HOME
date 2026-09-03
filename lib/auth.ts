import { NextAuthOptions } from 'next-auth'
import AzureADProvider from 'next-auth/providers/azure-ad'
import CredentialsProvider from 'next-auth/providers/credentials'
import { compare } from 'bcryptjs'
import { prisma } from './prisma'
import { emailDominioPanatickets } from './permisos'

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

        // Comparar contra TRIM(cedula) en la base, no solo recortar lo
        // tecleado: el registro nunca recortó espacios al guardar, así que
        // cédulas ya guardadas con un espacio de más (común al escribir
        // desde el teléfono) nunca calzarían con una búsqueda exacta, sin
        // importar qué contraseña se use.
        const cedulaBuscada = credentials.cedula.trim()
        const [aplicante] = await prisma.$queryRaw<
          { id: string; nombreCompleto: string; email: string; passwordHash: string | null }[]
        >`SELECT id, "nombreCompleto", email, "passwordHash" FROM aplicantes WHERE TRIM(cedula) = ${cedulaBuscada} LIMIT 1`
        if (!aplicante || !aplicante.passwordHash) return null

        // Recortar espacios accidentales (copiar/pegar una contraseña
        // temporal suele dejar uno al final) — mismo criterio que al
        // guardarla en registro/reseteo, para que nunca queden desalineados.
        const valid = await compare(credentials.password.trim(), aplicante.passwordHash)
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
            token.puedeVerFinanzas = created.puedeVerFinanzas
            token.availableTenants = []
          } else if (dbUser) {
            // Update name on each login
            if (account?.provider === 'azure-ad' && token.name) {
              await prisma.user.update({ where: { id: dbUser.id }, data: { name: token.name } })
            }
            token.role         = dbUser.role
            token.dbId         = dbUser.id
            token.isSuperAdmin = dbUser.isSuperAdmin
            token.puedeVerFinanzas = dbUser.puedeVerFinanzas

            const activeTenants = dbUser.tenants
              .filter(ut => ut.tenant.activo)
              .map(ut => ({ id: ut.tenant.id, slug: ut.tenant.slug, nombre: ut.tenant.nombre, logo: ut.tenant.logo, role: ut.role }))

            // Personal eventual de Panatickets identificado por dominio de correo,
            // SIN asignación explícita a ninguna empresa: se le da acceso por
            // defecto a Panatickets. Si ya tiene una empresa asignada (p. ej.
            // Print Media, que comparte el mismo dominio de correo corporativo),
            // se respeta esa asignación y no se le mezcla Panatickets.
            if (dbUser.role !== 'ADMIN' && activeTenants.length === 0 &&
                emailDominioPanatickets(token.email as string)) {
              const pana = await prisma.tenant.findFirst({ where: { slug: 'panatickets', activo: true } })
              if (pana) activeTenants.unshift({ id: pana.id, slug: pana.slug, nombre: pana.nombre, logo: pana.logo, role: 'USER' })
            }

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
        session.user.puedeVerFinanzas = (token.puedeVerFinanzas as boolean) ?? false
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

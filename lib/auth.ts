import { NextAuthOptions } from 'next-auth'
import AzureADProvider from 'next-auth/providers/azure-ad'
import { prisma } from './prisma'

export const authOptions: NextAuthOptions = {
  providers: [
    AzureADProvider({
      clientId: process.env.AZURE_AD_CLIENT_ID!,
      clientSecret: process.env.AZURE_AD_CLIENT_SECRET!,
      tenantId: process.env.AZURE_AD_TENANT_ID!,
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      if (!user.email) return false
      await prisma.user.upsert({
        where: { email: user.email },
        update: { name: user.name, image: user.image },
        create: {
          email: user.email,
          name: user.name,
          image: user.image,
          role: user.email === process.env.ADMIN_EMAIL ? 'ADMIN' : 'USER',
        },
      })
      return true
    },
    async session({ session }) {
      if (session.user?.email) {
        const dbUser = await prisma.user.findUnique({
          where: { email: session.user.email },
          select: { id: true, role: true },
        })
        if (dbUser) {
          session.user.id = dbUser.id
          session.user.role = dbUser.role as 'ADMIN' | 'USER'
        }
      }
      return session
    },
    async jwt({ token }) {
      return token
    },
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  session: { strategy: 'jwt' },
  debug: true,
  events: {
    async signIn(message) { console.log('SIGN_IN_EVENT', JSON.stringify(message)) },
    async session(message) { console.log('SESSION_EVENT', JSON.stringify(message)) },
  },
}

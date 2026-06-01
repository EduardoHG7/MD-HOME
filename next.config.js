/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['@prisma/client', 'prisma'],
  experimental: {
    serverActions: { bodySizeLimit: '10mb' },
  },
}

module.exports = nextConfig

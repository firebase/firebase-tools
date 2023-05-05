/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  experimental: {
    serverActions: true,
  },
  basePath: "/base",
  i18n: {
    locales: ['en', 'fr'],
    defaultLocale: 'en',
  },
}

module.exports = nextConfig

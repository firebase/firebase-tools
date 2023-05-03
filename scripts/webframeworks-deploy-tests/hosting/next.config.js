/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  experimental: {
    appDir: true
  },
  basePath: "/base",
  i18n: {
    locales: ['en-US', 'fr'],
    defaultLocale: 'en-US',
  },
}

module.exports = nextConfig

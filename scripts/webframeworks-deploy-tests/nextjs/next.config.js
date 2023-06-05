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
  rewrites: () => [{
    source: '/about',
    destination: '/',
  },],
  redirects: () => [{
    source: '/about',
    destination: '/',
    permanent: true,
  },],
  headers: () => [{
    source: '/about',
    headers: [
      {
        key: 'x-custom-header',
        value: 'my custom header value',
      },
      {
        key: 'x-another-custom-header',
        value: 'my other custom header value',
      },
    ],
  },],
}

module.exports = nextConfig

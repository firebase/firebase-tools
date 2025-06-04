/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {},
  },
  basePath: "/base",
  i18n: {
    locales: ['en', 'fr'],
    defaultLocale: 'en',
  },
  images: {
    domains: ['google.com'],
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

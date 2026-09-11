import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  typedRoutes: true,
  // `pg` opens raw TCP sockets and must never be bundled into a client chunk.
  serverExternalPackages: [
    'pg',
    '@react-pdf/renderer',
    'unpdf',
    'tesseract.js',
    '@napi-rs/canvas',
    'pdfjs-dist',
  ],
  experimental: {
    serverActions: {
      bodySizeLimit: '32mb',
    },
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
        ],
      },
    ];
  },
};

export default nextConfig;

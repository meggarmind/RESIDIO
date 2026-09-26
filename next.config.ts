import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit .next/standalone so the container image can run `node server.js`
  // without a node_modules install at runtime. See docs/deployment/docker.md.
  output: 'standalone',
  // sharp reaches us transitively via next, so output file tracing does not
  // always follow it into the standalone bundle. Including it explicitly is
  // Next's documented fix, and is why the image never passes --omit=optional.
  outputFileTracingIncludes: {
    '/*': ['node_modules/sharp/**/*'],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  // Externalize pdfjs-dist to avoid Next.js bundling issues with its worker
  serverExternalPackages: ['pdfjs-dist'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co' },
    ],
    formats: ['image/avif', 'image/webp'],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
  async redirects() {
    return [
      {
        source: '/admin/references',
        destination: '/settings/references',
        permanent: true,
      },
    ];
  },
};

export default nextConfig;

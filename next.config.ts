import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
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

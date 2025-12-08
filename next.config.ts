import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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

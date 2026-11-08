import type { NextConfig } from "next";

const nextConfig = {
  /* config options here */
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn.discordapp.com",
      },
    ],
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  async redirects() {
    return [
      // One canonical host: www serves the same site, so send it to the apex.
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.fortunabot.dev" }],
        destination: "https://fortunabot.dev/:path*",
        permanent: true,
      },
      {
        source: "/docs/commands",
        destination: "/commands",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;

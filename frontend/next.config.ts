import type { NextConfig } from "next";

const nextConfig = {
  turbopack: {
    root: __dirname,
  },
  eslint: {
    // Ignore linting during build to save memory on Render's free tier
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Ignore type checking during build to save memory on Render's free tier
    ignoreBuildErrors: true,
  },
  allowedDevOrigins: [
    '192.168.1.39',
    '192.168.1.39:3000',
    '192.168.1.39:3001',
    '192.168.1.36',
    '192.168.1.36:3000',
    '192.168.1.34', 
    '192.168.1.34:3000', 
    '10.208.57.166',
    '10.208.57.166:3000',
    'localhost:3000',
    'local-origin.dev', 
    '*.local-origin.dev'
  ],
} as NextConfig;

export default nextConfig;

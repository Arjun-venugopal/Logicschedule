import type { NextConfig } from "next";

const nextConfig = {
  // Enable static HTML export to generate the 'out' directory for Render Static Site
  output: 'export',
  images: {
    // Disable Next.js image optimization API since static export runs without a Node server
    unoptimized: true,
  },
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

/** @type {import('next').NextConfig} */
const nextConfig = {
  // TypeScript and ESLint errors are now properly handled
  // Removed ignore flags to catch errors during build
  eslint: {
    // Errors will now fail the build - fix them instead of ignoring
  },
  typescript: {
    // Errors will now fail the build - fix them instead of ignoring
  },
  images: {
    unoptimized: true,
  },
  // Enable standalone output for Docker deployments
  output: 'standalone',
}

export default nextConfig

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  experimental: {
    /**
     * framer-motion is a barrel export: one `import { motion }` used to pull the
     * whole package into a route's client bundle. This rewrites those imports to
     * the individual modules, so a page only ships the animations it uses.
     */
    optimizePackageImports: ["framer-motion"],
  },
  images: {
    // AVIF first — typically 20-30% smaller than WebP at the same quality.
    formats: ["image/avif", "image/webp"],
    // Cloudinary URLs are already content-addressed by their transform, so a
    // long browser/CDN cache is safe; a re-upload changes the public_id.
    minimumCacheTTL: 60 * 60 * 24 * 30,
    remotePatterns: [
      { protocol: "https", hostname: "res.cloudinary.com" },
      { protocol: "https", hostname: "i.ytimg.com" },
      { protocol: "https", hostname: "picsum.photos" },
      { protocol: "https", hostname: "fastly.picsum.photos" },
    ],
  },
  async headers() {
    return [
      {
        // Hashed build assets never change under the same URL.
        source: "/_next/static/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
    ];
  },
};

export default nextConfig;

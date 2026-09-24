/** @type {import('next').NextConfig} */
const nextConfig = {
  // One less header on every response, and one less thing it says about us.
  poweredByHeader: false,

  images: {
    // Cloudinary already resizes and picks the format, so the srcset asks it
    // directly instead of routing every size through /_next/image first. See
    // lib/cloudinary-loader.ts. With a custom loader the built-in optimiser is
    // off, which is also why there are no remotePatterns: <Pic /> serves any
    // non-Cloudinary URL as it is (`unoptimized`), from whatever host it names.
    loader: "custom",
    loaderFile: "./lib/cloudinary-loader.ts",
  },

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
        // No Content-Security-Policy yet, and that is deliberate. app/layout.tsx
        // runs a bare inline <script> to set the theme before first paint; a
        // `script-src 'self'` policy would silently break it and the site would
        // flash white on every load. Adding CSP means moving that script to a
        // per-request nonce first, which makes every route dynamic — a trade
        // worth measuring before making.
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          // The one file that must never be served from a stale cache: it is
          // what decides how everything else is cached.
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;

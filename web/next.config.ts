import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'self'; base-uri 'self'; form-action 'self'; object-src 'none'" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  // Tag-based fetch caching (instant invalidation on publish) without build-time API calls.
  cacheComponents: false,
  outputFileTracingIncludes: { "/**": ["./src/assets/**"] },
  experimental: { serverActions: { bodySizeLimit: "12mb" } }, // media uploads go through a server action
  async redirects() {
    return [
      // One canonical host: the bare domain forwards to www (keeps Ghost-era search rankings).
      { source: "/:path*", has: [{ type: "host", value: "tudoranaclark.com" }], destination: "https://www.tudoranaclark.com/:path*", permanent: true },
      // Old Ghost URLs. Post slugs (/my-post/) are handled by app/(site)/[slug].
      { source: "/articles", destination: "/writing", permanent: true },
      { source: "/notes", destination: "/writing", permanent: true },
      { source: "/contact", destination: "/about#contact", permanent: true },
      { source: "/subscribe", destination: "/#newsletter", permanent: true },
      { source: "/signin", destination: "/", permanent: true },
      { source: "/signup", destination: "/#newsletter", permanent: true },
      { source: "/tag/:tag*", destination: "/writing", permanent: true },
      { source: "/author/:name*", destination: "/about", permanent: true },
      { source: "/rss", destination: "/feed.xml", permanent: true },
      { source: "/ghost/:path*", destination: "/studio", permanent: false },
    ];
  },
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/:section(writing|research|speaking)/:slug([a-z0-9-]+)\\.md", destination: "/md/:section/:slug" },
        { source: "/:key([a-f0-9]{32})\\.txt", destination: "/indexnow/:key" },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/studio/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }, { key: "Cache-Control", value: "no-store" }] },
    ];
  },
};

export default nextConfig;

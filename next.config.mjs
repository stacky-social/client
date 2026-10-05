import path from "node:path";
import WebpackObfuscator from "webpack-obfuscator";

// Obfuscate our own client code (src/) in production browser bundles so the
// shipped JS doesn't read like the source. Framework/vendor chunks are left
// alone: they're public anyway and obfuscating them is slow and bloats output.
// Set OBFUSCATE=0 to skip (e.g. when debugging a prod build).
const OBFUSCATOR_OPTIONS = {
  compact: true,
  identifierNamesGenerator: "hexadecimal",
  renameGlobals: false,
  stringArray: true,
  stringArrayEncoding: ["base64"],
  stringArrayThreshold: 1,
  stringArrayRotate: true,
  stringArrayShuffle: true,
  splitStrings: true,
  splitStringsChunkLength: 8,
  // Off: these cost a lot of runtime perf (the feed is scroll-heavy) or break
  // React/Next (selfDefending, debugProtection).
  controlFlowFlattening: false,
  deadCodeInjection: false,
  selfDefending: false,
  debugProtection: false,
  sourceMap: false,
};

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // NEXT_DIST_DIR lets a test build run beside `pnpm dev` without overwriting
  // the dev server's .next (which breaks it with 500s and missing chunks).
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Keep tracing scoped to this app when a developer has another pnpm lockfile
  // higher in the filesystem (Next 15 otherwise guesses the wrong workspace).
  outputFileTracingRoot: process.cwd(),
  // The research feed was renamed /listy-injection -> /ChineseEVs (the hashtag it
  // shows). Redirect old links (base + post-detail sub-paths) so they keep working.
  productionBrowserSourceMaps: false,
  webpack(config, { dev, isServer }) {
    if (!dev && !isServer && process.env.OBFUSCATE !== "0") {
      config.module.rules.push({
        test: /\.(m?js|jsx|tsx?)$/,
        include: [path.resolve(process.cwd(), "src")],
        enforce: "post",
        use: { loader: WebpackObfuscator.loader, options: OBFUSCATOR_OPTIONS },
      });
    }
    return config;
  },
  async redirects() {
    return [
      {
        source: "/listy-injection/:path*",
        destination: "/ChineseEVs/:path*",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;

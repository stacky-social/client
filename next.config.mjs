/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Keep tracing scoped to this app when a developer has another pnpm lockfile
  // higher in the filesystem (Next 15 otherwise guesses the wrong workspace).
  outputFileTracingRoot: process.cwd(),
  // The research feed was renamed /listy-injection -> /ChineseEVs (the hashtag it
  // shows). Redirect old links (base + post-detail sub-paths) so they keep working.
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

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
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

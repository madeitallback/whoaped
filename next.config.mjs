/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingIncludes: {
    "/api/leaderboard/fomo/refresh": [
      "./node_modules/playwright-core/**/*",
      "./node_modules/@sparticuz/chromium/**/*",
    ],
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "prod-fomo-profile-pics.s3.amazonaws.com", pathname: "/**" },
      { protocol: "https", hostname: "cdn.dexscreener.com", pathname: "/**" },
      { protocol: "https", hostname: "dd.dexscreener.com", pathname: "/**" },
      { protocol: "https", hostname: "arweave.net", pathname: "/**" },
      { protocol: "https", hostname: "ipfs.io", pathname: "/**" },
    ],
  },
};

export default nextConfig;

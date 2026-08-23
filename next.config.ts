import type { NextConfig } from "next";

// App Router bundles server dependencies by default. Keeping Solana packages
// bundled avoids Node's CommonJS/ESM boundary in Vercel server functions.
const nextConfig: NextConfig = {};

export default nextConfig;

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [{ protocol: "https", hostname: "prod-fomo-profile-pics.s3.amazonaws.com", pathname: "/**" }],
  },
};

export default nextConfig;

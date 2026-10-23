/** @type {import('next').NextConfig} */
const nextConfig = {
  images: { unoptimized: true },
  // No ESLint config in this repo; types are checked by `tsc --noEmit` instead.
  eslint: { ignoreDuringBuilds: true },
};
export default nextConfig;

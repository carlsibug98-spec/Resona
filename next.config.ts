import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  // allow relocating build output (sandbox disk cleaner targets .next in the project)
  distDir: process.env.NEXT_DIST_DIR || ".next",
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // hide the Next.js dev-tools "N" badge that overlaps the sidebar
  devIndicators: false,
  // no next/image anywhere in the app — keep the optimizer (and its native
  // sharp dependency) completely out of the runtime path
  images: { unoptimized: true },
};

export default nextConfig;

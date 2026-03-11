import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@clerk/nextjs", "@clerk/shared"],
};

export default nextConfig;

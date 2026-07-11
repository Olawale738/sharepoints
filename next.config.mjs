import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: projectRoot,
  eslint: {
    ignoreDuringBuilds: true
  },
  typescript: {
    ignoreBuildErrors: true
  },
  experimental: {
    cpus: 2
  },
  webpack(config, { isServer }) {
    if (isServer && config.optimization) {
      config.optimization.splitChunks = false;
    }

    return config;
  }
};

export default nextConfig;

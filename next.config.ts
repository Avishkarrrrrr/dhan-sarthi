import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  /**
   * Emit a self-contained server bundle. Next traces only the node_modules
   * actually reached at runtime, so the artefact is a few hundred MB instead of
   * the full dependency tree — small enough for the sandbox's 8 GiB root volume,
   * and deployable without running `npm install` on the instance (which has no
   * internet access).
   */
  output: "standalone",
};

export default nextConfig;

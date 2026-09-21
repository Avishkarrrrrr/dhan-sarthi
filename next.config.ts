import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  /**
   * Emit a self-contained server bundle. Next traces only the node_modules
   * actually reached at runtime, so the artefact is ~16 MB instead of the full
   * dependency tree, and deploys without running `npm install` on the instance.
   */
  output: "standalone",

  /**
   * pdf.js is reached through a dynamic `import()` inside the CAS route, which
   * the tracer cannot follow — it shipped a standalone build with no pdfjs in
   * it, and every upload answered "this file could not be read".
   *
   * The worker is listed too, and is not optional: even with no worker thread,
   * pdf.js loads `pdf.worker.mjs` as a "fake worker" on the main thread, and
   * without it parsing fails at the first page with a message about a module
   * it cannot find. Both files together are under a megabyte.
   */
  outputFileTracingIncludes: {
    "/api/import/cas": [
      "./node_modules/pdfjs-dist/legacy/build/pdf.min.mjs",
      "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
    ],
  },
};

export default nextConfig;

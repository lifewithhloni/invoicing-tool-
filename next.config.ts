import type { NextConfig } from "next";

// Cache Components is deliberately off: every page in this app is private,
// per-user financial data that must always be read fresh at request time.
const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

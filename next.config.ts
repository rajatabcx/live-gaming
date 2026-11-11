import type { NextConfig } from "next";
import { networkInterfaces } from "node:os";

/**
 * In local dev the host screen runs on localhost, which a phone can't reach.
 * Find this machine's LAN address so the QR code points somewhere useful.
 */
function lanAddress(): string | null {
  for (const addrs of Object.values(networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family === "IPv4" && !a.internal && /^(10|172|192)\./.test(a.address)) return a.address;
    }
  }
  return null;
}

const isDev = process.env.NODE_ENV !== "production";
const lan = isDev ? lanAddress() : null;

const nextConfig: NextConfig = {
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  partialPrefetching: true,
  allowedDevOrigins: lan ? [lan] : [],
  env: {
    NEXT_PUBLIC_DEV_LAN_ORIGIN: lan ? `http://${lan}:${process.env.PORT ?? 3000}` : "",
  },
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

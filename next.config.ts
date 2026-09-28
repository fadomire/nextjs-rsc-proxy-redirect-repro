import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Only here for comparison with the redirect issued from proxy.ts: the same
  // redirect declared in next.config keeps the _rsc search param.
  async redirects() {
    return [{ source: "/config-redirect-source", destination: "/target", permanent: false }];
  },
};

export default nextConfig;

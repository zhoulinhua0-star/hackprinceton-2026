// The public card pages (DECISIONS #106). Self-contained on purpose: deployed from this folder alone, so nothing
// else in the repo (.env, .data, the dashboard) is ever uploaded.
/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }, { key: "Referrer-Policy", value: "no-referrer" }] }];
  },
};

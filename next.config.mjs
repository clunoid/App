/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Pin the workspace root (stray lockfiles in the home dir confuse detection).
  outputFileTracingRoot: import.meta.dirname,
  // `ws` (used server-side by the MT5 market-data feed) must load as a real node
  // module, not be webpack-bundled — otherwise its optional bufferUtil native
  // addon breaks with "bufferUtil.mask is not a function".
  serverExternalPackages: ["ws"],
  // The paid .mq5 files live outside public/ and are read at runtime by the
  // gated download route. Trace them into that function's bundle so they exist
  // on Vercel (files outside public/ aren't included otherwise).
  outputFileTracingIncludes: {
    "/api/trading/mt5/download/[botId]": ["./content/mt5/**"],
  },

  /**
   * URLs that used to be pages.
   *
   * /trading/creator-program and /trading/is-clunoid-legit were live briefly as
   * search landing pages before being removed. Middleware only redirects things
   * OUTSIDE /trading, so anything under it that has no route falls through to a
   * 404 - which is what these were doing. They now land on the trading front
   * door, where somebody who followed one of those links can actually get
   * started.
   *
   * Temporary, not permanent, on purpose: a 308 is cached hard by browsers and
   * is genuinely painful to undo, and these two URLs have existed as pages once
   * already. A 307 costs nothing here - they were live for about an hour, so
   * there is no meaningful search history to consolidate - and it leaves the
   * door open to putting real pages back at these addresses.
   */
  async redirects() {
    return [
      { source: "/trading/creator-program", destination: "/trading", permanent: false },
      { source: "/trading/is-clunoid-legit", destination: "/trading", permanent: false },
    ];
  },
};

export default nextConfig;

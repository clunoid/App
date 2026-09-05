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
   * A URL that used to be a page.
   *
   * /trading/creator-program was live briefly as a search landing page before
   * being removed. Middleware only redirects things OUTSIDE /trading, so
   * anything under it with no route falls through to a 404 - which is what this
   * was doing. It now lands on the trading front door, where somebody who
   * followed that link can actually get started.
   *
   * Temporary, not permanent, on purpose: a 308 is cached hard by browsers and
   * is genuinely painful to undo, and this URL has existed as a page once
   * already. A 307 costs nothing here and leaves the door open to putting a
   * real page back at the address.
   *
   * /trading/is-clunoid-legit was in this list for the same reason and is NOT
   * any more: it is a real page again, and a redirect sitting in front of it
   * would have answered 307 to every reader and every crawler while the page
   * itself sat unreachable behind it.
   */
  async redirects() {
    return [
      { source: "/trading/creator-program", destination: "/trading", permanent: false },
    ];
  },
};

export default nextConfig;

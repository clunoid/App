/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Pin the workspace root (stray lockfiles in the home dir confuse detection).
  outputFileTracingRoot: import.meta.dirname,
  // `ws` (used server-side by the MT5 market-data feed) must load as a real node
  // module, not be webpack-bundled — otherwise its optional bufferUtil native
  // addon breaks with "bufferUtil.mask is not a function".
  serverExternalPackages: ["ws"],
};

export default nextConfig;

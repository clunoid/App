/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Pin the workspace root (stray lockfiles in the home dir confuse detection).
  outputFileTracingRoot: import.meta.dirname,
};

export default nextConfig;

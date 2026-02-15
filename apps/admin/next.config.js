/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@locker/config", "@locker/types"],
}

module.exports = nextConfig

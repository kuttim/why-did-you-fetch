/** @type {import('next').NextConfig} */
const nextConfig = {
  // This example lives nested inside the why-did-you-fetch repo, which has its own
  // package-lock.json — pin the workspace root explicitly so Next.js doesn't have to guess.
  turbopack: {
    root: __dirname,
  },
};

module.exports = nextConfig;

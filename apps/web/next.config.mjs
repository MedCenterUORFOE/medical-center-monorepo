/** @type {import('next').NextConfig} */
const nextConfig = {
    experimental: {
      serverComponentsExternalPackages: ['bcryptjs', '@medical-center/db'],
    },
  };
  
  export default nextConfig;
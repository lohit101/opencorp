/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@opencorp/shared', '@opencorp/llm', '@opencorp/tools', '@opencorp/memory', '@opencorp/agent-runtime', '@opencorp/orchestrator'],
  serverExternalPackages: ['@prisma/client'],
};

export default nextConfig;
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  // 启用实验性功能以提升性能
  experimental: {
    optimizePackageImports: ['lucide-react', '@radix-ui/react-dialog', '@radix-ui/react-select'],
  },
  // 优化图片配置
  images: {
    unoptimized: true, // 保持静态导出兼容性
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*',
        port: '',
        pathname: '**',
      },
      {
        protocol: 'http',
        hostname: '*',
        port: '',
        pathname: '**',
      }
    ],
    // 添加图片格式优化
    formats: ['image/webp', 'image/avif'],
  },
  // 启用压缩
  compress: true,
}

export default nextConfig 
import { Suspense } from 'react'
import { PageLoading } from '@/components/ui/loading-spinner'

/**
 * 主页面组件 - 优化LCP性能
 * 使用动态导入和代码分割提升首屏加载速度
 */
export default function Home() {
  return (
    <Suspense fallback={<PageLoading />}>
      <HomeContent />
    </Suspense>
  )
}

/**
 * 动态导入主内容组件，实现代码分割
 */
async function HomeContent() {
  const { default: HomeContentComponent } = await import('./home-content')
  return <HomeContentComponent />
}


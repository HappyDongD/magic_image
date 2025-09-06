import { cn } from '@/lib/utils'

/**
 * 加载动画组件 - 提供美观的加载体验
 */
interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
  text?: string
}

export function LoadingSpinner({ 
  size = 'md', 
  className,
  text = '加载中...'
}: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-8 w-8', 
    lg: 'h-12 w-12'
  }

  return (
    <div className={cn('flex flex-col items-center justify-center gap-4', className)}>
      {/* 旋转的圆圈动画 */}
      <div className="relative">
        <div 
          className={cn(
            'animate-spin rounded-full border-2 border-gray-200',
            sizeClasses[size]
          )}
        />
        <div 
          className={cn(
            'animate-spin rounded-full border-2 border-primary border-t-transparent absolute top-0 left-0',
            sizeClasses[size]
          )}
          style={{ animationDirection: 'reverse', animationDuration: '0.8s' }}
        />
      </div>
      
      {/* 加载文本 */}
      {text && (
        <p className="text-sm text-gray-500 animate-pulse">
          {text}
        </p>
      )}
    </div>
  )
}

/**
 * 页面级加载组件 - 用于页面初始加载
 */
export function PageLoading() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center space-y-6">
        {/* 魔法画笔动画 */}
        <div className="relative mx-auto w-16 h-16">
          <div className="absolute inset-0 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 animate-pulse" />
          <div className="absolute inset-2 rounded-full bg-white animate-spin">
            <div className="absolute top-1 left-1/2 transform -translate-x-1/2 w-2 h-2 bg-blue-500 rounded-full animate-bounce" />
          </div>
        </div>
        
        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-gray-800">魔法AI绘画</h2>
          <p className="text-gray-500">正在准备您的创作环境...</p>
        </div>
        
        {/* 进度条 */}
        <div className="w-64 mx-auto">
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-blue-500 to-purple-600 rounded-full animate-pulse" />
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * 卡片加载骨架屏
 */
export function CardSkeleton() {
  return (
    <div className="space-y-4 p-4">
      <div className="h-4 bg-gray-200 rounded animate-pulse" />
      <div className="h-4 bg-gray-200 rounded animate-pulse w-3/4" />
      <div className="h-4 bg-gray-200 rounded animate-pulse w-1/2" />
    </div>
  )
}

/**
 * 图片加载占位符
 */
export function ImageSkeleton() {
  return (
    <div className="w-full aspect-square bg-gray-200 rounded-lg animate-pulse flex items-center justify-center">
      <div className="text-gray-400">
        <svg className="w-12 h-12" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
        </svg>
      </div>
    </div>
  )
}

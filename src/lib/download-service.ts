import { TaskResult, DownloadConfig } from '@/types'
import { storage } from './storage'
import { toast } from 'sonner'
import { fileDownloadManager } from './file-download-manager'

export interface DownloadOptions {
  taskName?: string
  autoDownload?: boolean
  onStatusChange?: (status: DownloadStatus) => void
  showToast?: boolean
}

export interface DownloadStatus {
  status: 'idle' | 'queued' | 'downloading' | 'success' | 'error'
  progress?: number
  bytesPerSec?: number
  error?: string
}

class DownloadService {
  private downloadStatus: Map<string, DownloadStatus> = new Map()
  private statusListeners: Map<string, ((status: DownloadStatus) => void)[]> = new Map()

  /**
   * 统一下载图片服务
   * 处理所有下载场景：自动下载、手动下载、重试下载等
   */
  async downloadImage(
    imageUrl: string, 
    options: DownloadOptions = {}
  ): Promise<boolean> {
    const {
      taskName = 'single',
      autoDownload = false,
      onStatusChange,
      showToast = true
    } = options

    // 生成唯一的下载ID
    const downloadId = this.generateDownloadId(imageUrl, taskName)
    
    // 初始化下载状态
    this.setDownloadStatus(downloadId, { status: 'queued' })
    
    try {
      // 创建临时的任务结果对象用于下载管理器
      const tempResult: TaskResult = {
        id: downloadId,
        taskItemId: downloadId,
        imageUrl,
        downloaded: false,
        createdAt: new Date().toISOString()
      }

      // 使用文件下载管理器处理下载
      const success = fileDownloadManager.addDownload(tempResult, taskName)
      
      if (!success) {
        // 如果已经在下载队列中
        this.setDownloadStatus(downloadId, { 
          status: 'queued',
          progress: 0
        })
        if (showToast) {
          toast.info('图片已在下载队列中')
        }
        return true
      }

      // 监听下载进度
      this.setupDownloadListeners(downloadId, imageUrl, onStatusChange, showToast)

      return true

    } catch (error) {
      console.error('下载失败:', error)
      this.setDownloadStatus(downloadId, {
        status: 'error',
        error: error instanceof Error ? error.message : '下载失败'
      })
      
      if (showToast) {
        toast.error('下载失败，请重试')
      }
      return false
    }
  }

  /**
   * 批量下载图片
   */
  async downloadBatchImages(
    results: TaskResult[], 
    taskName: string,
    options: Omit<DownloadOptions, 'taskName'> = {}
  ): Promise<string[]> {
    const addedUrls = fileDownloadManager.addBatchDownload(results, taskName)
    
    // 为每个下载项设置监听器
    results.forEach(result => {
      if (addedUrls.includes(result.imageUrl)) {
        const downloadId = this.generateDownloadId(result.imageUrl, taskName)
        this.setDownloadStatus(downloadId, { status: 'queued' })
        this.setupDownloadListeners(downloadId, result.imageUrl, options.onStatusChange, options.showToast)
      }
    })

    if (options.showToast !== false && addedUrls.length > 0) {
      toast.success(`已添加 ${addedUrls.length} 个文件到下载队列`)
    }

    return addedUrls
  }

  /**
   * 重试失败的下载
   */
  async retryDownload(
    imageUrl: string,
    taskName?: string,
    options: Omit<DownloadOptions, 'taskName'> = {}
  ): Promise<boolean> {
    return this.downloadImage(imageUrl, {
      taskName: taskName || 'retry',
      showToast: options.showToast,
      onStatusChange: options.onStatusChange
    })
  }

  /**
   * 获取下载状态
   */
  getDownloadStatus(imageUrl: string, taskName?: string): DownloadStatus {
    const downloadId = this.generateDownloadId(imageUrl, taskName || 'single')
    return this.downloadStatus.get(downloadId) || { status: 'idle' }
  }

  /**
   * 监听下载状态变化
   */
  onDownloadStatusChange(
    imageUrl: string, 
    taskName: string,
    listener: (status: DownloadStatus) => void
  ): () => void {
    const downloadId = this.generateDownloadId(imageUrl, taskName)
    
    if (!this.statusListeners.has(downloadId)) {
      this.statusListeners.set(downloadId, [])
    }
    this.statusListeners.get(downloadId)!.push(listener)

    // 立即发送当前状态
    const currentStatus = this.getDownloadStatus(imageUrl, taskName)
    listener(currentStatus)

    return () => {
      const listeners = this.statusListeners.get(downloadId)
      if (listeners) {
        const index = listeners.indexOf(listener)
        if (index > -1) {
          listeners.splice(index, 1)
        }
      }
    }
  }

  /**
   * 设置下载监听器
   */
  private setupDownloadListeners(
    downloadId: string,
    imageUrl: string,
    onStatusChange?: (status: DownloadStatus) => void,
    showToast: boolean = true
  ) {
    // 监听全局下载事件
    const handleDownloadEvent = (event: any) => {
      const eventUrl = event.detail?.url
      if (eventUrl === imageUrl) {
        if (event.type === 'download:start') {
          this.setDownloadStatus(downloadId, { 
            status: 'downloading',
            progress: 0
          })
        } else if (event.type === 'download:done') {
          this.setDownloadStatus(downloadId, { 
            status: 'success',
            progress: 100
          })
          if (showToast) {
            toast.success('下载完成')
          }
        } else if (event.type === 'download:error') {
          this.setDownloadStatus(downloadId, { 
            status: 'error',
            error: event.detail?.error || '下载失败'
          })
          if (showToast) {
            toast.error('下载失败')
          }
        }
      }
    }

    // 监听进度事件
    const handleProgress = (progress: number, bytesPerSec: number) => {
      this.setDownloadStatus(downloadId, {
        status: 'downloading',
        progress,
        bytesPerSec
      })
    }

    // 添加事件监听器
    if (typeof window !== 'undefined') {
      window.addEventListener('download:start', handleDownloadEvent)
      window.addEventListener('download:done', handleDownloadEvent)
      window.addEventListener('download:error', handleDownloadEvent)
    }

    // 清理函数
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('download:start', handleDownloadEvent)
        window.removeEventListener('download:done', handleDownloadEvent)
        window.removeEventListener('download:error', handleDownloadEvent)
      }
    }
  }

  /**
   * 设置下载状态并通知监听器
   */
  private setDownloadStatus(downloadId: string, status: DownloadStatus) {
    this.downloadStatus.set(downloadId, status)
    
    // 通知所有监听器
    const listeners = this.statusListeners.get(downloadId)
    if (listeners) {
      listeners.forEach(listener => listener(status))
    }
  }

  /**
   * 生成唯一的下载ID
   */
  private generateDownloadId(imageUrl: string, taskName: string): string {
    return `${taskName}:${imageUrl}`
  }

  /**
   * 清理下载状态
   */
  cleanup() {
    this.downloadStatus.clear()
    this.statusListeners.clear()
  }
}

// 创建全局下载服务实例
export const downloadService = new DownloadService()

// 导出类型
// 导出类型
export type { DownloadOptions as DownloadServiceOptions, DownloadStatus as DownloadServiceStatus }
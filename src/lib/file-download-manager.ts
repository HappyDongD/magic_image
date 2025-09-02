import { TaskResult, DownloadConfig } from '@/types'
import { storage } from './storage'
import { toast } from 'sonner'

export interface DownloadTask {
  id: string
  url: string
  filename: string
  taskId?: string
  taskName?: string
}

export class FileDownloadManager {
  private downloadQueue: DownloadTask[] = []
  private isDownloading = false
  private maxConcurrentDownloads = 3

  constructor() {
    // 监听页面卸载事件，确保下载完成
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => {
        if (this.downloadQueue.length > 0) {
          return '还有文件正在下载中，确定要离开吗？'
        }
      })
    }
  }

  // 添加单个下载任务
  addDownload(result: TaskResult, taskName?: string): void {
    const config = storage.getDownloadConfig()
    const filename = this.generateFilename(result, config, taskName)

    this.downloadQueue.push({
      id: result.id,
      url: result.imageUrl,
      filename,
      taskId: result.taskItemId,
      taskName
    })

    // 如果没有正在下载，开始下载
    if (!this.isDownloading) {
      this.startDownload()
    }
  }

  // 批量添加下载任务
  addBatchDownload(results: TaskResult[], taskName?: string): void {
    const config = storage.getDownloadConfig()
    const tasks = results.map(result => ({
      id: result.id,
      url: result.imageUrl,
      filename: this.generateFilename(result, config, taskName),
      taskId: result.taskItemId,
      taskName
    }))

    this.downloadQueue.push(...tasks)

    // 如果没有正在下载，开始下载
    if (!this.isDownloading) {
      this.startDownload()
    }
  }

  // 开始下载队列
  private async startDownload(): Promise<void> {
    if (this.isDownloading || this.downloadQueue.length === 0) {
      return
    }

    this.isDownloading = true
    toast.info(`开始下载 ${this.downloadQueue.length} 个文件`)

    const workers = Math.min(this.maxConcurrentDownloads, this.downloadQueue.length)

    const downloadPromises = Array.from({ length: workers }, async (_, index) => {
      while (this.downloadQueue.length > 0) {
        const task = this.downloadQueue.shift()
        if (task) {
          await this.downloadFile(task)
        }
      }
    })

    try {
      await Promise.allSettled(downloadPromises)
      toast.success('所有文件下载完成')
    } catch (error) {
      console.error('批量下载出错:', error)
      toast.error('部分文件下载失败')
    } finally {
      this.isDownloading = false
    }
  }

  // 下载单个文件
  private async downloadFile(task: DownloadTask): Promise<void> {
    try {
      const response = await fetch(task.url)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const blob = await response.blob()

      // 创建下载链接
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = task.filename
      a.style.display = 'none'

      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)

      URL.revokeObjectURL(url)

      console.log(`文件已下载: ${task.filename}`)

    } catch (error) {
      console.error(`下载失败 ${task.filename}:`, error)
      toast.error(`下载失败: ${task.filename}`)

      // 可以选择将失败的任务重新加入队列
      // this.downloadQueue.push(task)
    }
  }

  // 生成文件名
  private generateFilename(result: TaskResult, config: DownloadConfig, taskName?: string): string {
    const now = new Date()
    const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, -5)
    const date = now.toISOString().split('T')[0]

    let filename = config.filenameTemplate

    // 替换模板变量
    filename = filename.replace('{task}', taskName || 'batch')
    filename = filename.replace('{index}', result.id.slice(-6))
    filename = filename.replace('{timestamp}', timestamp)
    filename = filename.replace('{date}', date)
    filename = filename.replace('{taskId}', result.taskItemId.slice(-6))

    // 确保文件名不包含非法字符
    filename = filename.replace(/[<>:"/\\|?*]/g, '_')

    // 添加扩展名
    if (!filename.toLowerCase().endsWith('.png') && !filename.toLowerCase().endsWith('.jpg')) {
      filename += '.png'
    }

    return filename
  }

  // 获取下载状态
  getDownloadStatus() {
    return {
      isDownloading: this.isDownloading,
      queueLength: this.downloadQueue.length,
      maxConcurrent: this.maxConcurrentDownloads
    }
  }

  // 取消所有下载
  cancelAllDownloads(): void {
    this.downloadQueue = []
    this.isDownloading = false
    toast.info('已取消所有下载任务')
  }

  // 设置最大并发下载数
  setMaxConcurrentDownloads(max: number): void {
    this.maxConcurrentDownloads = Math.max(1, Math.min(max, 10))
  }

  // 清理资源
  destroy(): void {
    this.cancelAllDownloads()
    if (typeof window !== 'undefined') {
      window.removeEventListener('beforeunload', () => {})
    }
  }
}

// 创建全局下载管理器实例
export const fileDownloadManager = new FileDownloadManager()
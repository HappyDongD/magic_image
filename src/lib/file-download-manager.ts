import { TaskResult, DownloadConfig } from '@/types'
import { storage } from './storage'
import { toast } from 'sonner'

export interface DownloadTask {
  id: string
  url: string
  filename: string
  taskId?: string
  taskName?: string
  status: 'pending' | 'downloading' | 'completed' | 'failed'
  progress?: number
  bytesPerSec?: number
  error?: string
  retryCount?: number
}

export class FileDownloadManager {
  private downloadQueue: DownloadTask[] = []
  private activeDownloads: Map<string, DownloadTask> = new Map()
  private isDownloading = false
  private maxConcurrentDownloads = 3
  private progressListeners: Map<string, (progress: number, bytesPerSec: number) => void> = new Map()

  constructor() {
    // 监听页面卸载事件，确保下载完成
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => {
        if (this.downloadQueue.length > 0 || this.activeDownloads.size > 0) {
          return '还有文件正在下载中，确定要离开吗？'
        }
      })

      // 订阅 Tauri 进度事件
      this.setupProgressListener()
    }
  }

  private async setupProgressListener() {
    try {
      const { listen } = await import('@tauri-apps/api/event')
      listen('download:progress', (event: any) => {
        const payload = event?.payload || {}
        const url = String(payload.url || '')
        if (!url) return

        const downloaded = Number(payload.downloaded || 0)
        const total = Number(payload.total || 0)
        const bytesPerSec = Number(payload.bytesPerSec || 0)
        const progress = total > 0 ? Math.min(1, downloaded / total) : 0

        // 更新任务状态
        const task = this.activeDownloads.get(url)
        if (task) {
          task.progress = progress
          task.bytesPerSec = bytesPerSec
          
          // 通知进度监听器
          const listener = this.progressListeners.get(url)
          if (listener) {
            listener(progress, bytesPerSec)
          }
        }
      })
    } catch (error) {
      console.error('Failed to setup progress listener:', error)
    }
  }

  // 添加单个下载任务
  addDownload(result: TaskResult, taskName?: string): void {
    const config = storage.getDownloadConfig()
    const filename = this.generateFilename(result, config, taskName)

    // 检查是否已经在下载队列中
    const existingTask = this.downloadQueue.find(t => t.url === result.imageUrl) || 
                        Array.from(this.activeDownloads.values()).find(t => t.url === result.imageUrl)
    
    if (existingTask) {
      console.log('Download task already exists:', result.imageUrl)
      return
    }

    const task: DownloadTask = {
      id: result.id,
      url: result.imageUrl,
      filename,
      taskId: result.taskItemId,
      taskName,
      status: 'pending',
      retryCount: 0
    }

    this.downloadQueue.push(task)

    // 如果没有正在下载，开始下载
    if (!this.isDownloading) {
      this.startDownload()
    }
  }

  // 批量添加下载任务
  addBatchDownload(results: TaskResult[], taskName?: string): void {
    const config = storage.getDownloadConfig()
    
    results.forEach(result => {
      // 检查是否已经在下载队列中
      const existingTask = this.downloadQueue.find(t => t.url === result.imageUrl) || 
                          Array.from(this.activeDownloads.values()).find(t => t.url === result.imageUrl)
      
      if (existingTask) {
        console.log('Download task already exists:', result.imageUrl)
        return
      }

      const task: DownloadTask = {
        id: result.id,
        url: result.imageUrl,
        filename: this.generateFilename(result, config, taskName),
        taskId: result.taskItemId,
        taskName,
        status: 'pending',
        retryCount: 0
      }

      this.downloadQueue.push(task)
    })

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

    const downloadPromises = Array.from({ length: workers }, async () => {
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
    // 添加到活跃下载列表
    this.activeDownloads.set(task.url, task)
    task.status = 'downloading'
    task.progress = 0

    try {
      // 1) 优先使用官方 ESM API（在 Tauri 窗口内可用）
      let tauriInvoke: ((cmd: string, args?: any) => Promise<any>) | undefined
      try {
        const mod = await import('@tauri-apps/api/core')
        if (mod && typeof mod.invoke === 'function') {
          tauriInvoke = mod.invoke as any
        }
      } catch (_) {}

      if (!tauriInvoke) {
        const w = window as any
        const tauriObj = w?.__TAURI__
        tauriInvoke = (tauriObj && typeof tauriObj.invoke === 'function' && tauriObj.invoke)
          || (tauriObj?.core && typeof tauriObj.core.invoke === 'function' && tauriObj.core.invoke)
          || undefined
      }

      if (tauriInvoke) {
        const config = storage.getDownloadConfig()
        const subdirs: string[] = []
        if (config.organizeByDate) {
          const today = new Date().toISOString().split('T')[0]
          subdirs.push(today)
        }
        if (config.organizeByTask && task.taskName) {
          subdirs.push(task.taskName)
        }
        const baseDir = config.defaultPath || undefined
        // 让后端保存到 baseDir/subdir1/subdir2/filename
        // 后端 download_file 仅接受 dir 和 filename，这里把子路径拼进 filename 以落地
        const filenameWithDirs = (subdirs.length > 0 ? subdirs.join('/') + '/' : '') + task.filename

        console.log('[download] using tauri invoke')
        const savedPath = await tauriInvoke('download_file', {
          url: task.url,
          filename: filenameWithDirs,
          dir: baseDir
        }) as string

        // 更新任务状态
        task.status = 'completed'
        task.progress = 1

        // 写回任务结果：标记已下载与本地路径
        try {
          const tasks = storage.getBatchTasks()
          let updated = false
          for (const t of tasks) {
            const r = t.results.find(r => r.id === task.id)
            if (r) {
              // 如果 savedPath 不是绝对路径，需要构造完整路径
              const fullPath = savedPath.startsWith('/') ? savedPath : 
                              (baseDir ? `${baseDir}/${savedPath}` : savedPath)
              r.localPath = fullPath
              r.downloaded = true
              updated = true
              storage.saveBatchTask(t)
              console.log('[download] 更新本地路径:', { id: task.id, localPath: fullPath })
              break
            }
          }
          if (!updated) {
            console.warn('[download] 未找到匹配的 TaskResult 以写回本地路径', task.id)
          }
        } catch (e) {
          console.error('[download] 写回本地路径失败', e)
        }

        toast.success(`已保存: ${savedPath}`)
        return
      }

      // 3) 最后回退到 Web Fetch（受 CORS 限制）
      console.log('[download] using web fetch (fallback)')
      const response = await fetch(task.url)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const blob = await response.blob()

      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = task.filename
      a.style.display = 'none'

      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      // 更新任务状态
      task.status = 'completed'
      task.progress = 1

      console.log(`文件已下载: ${task.filename}`)

    } catch (error) {
      console.error(`下载失败 ${task.filename}:`, error)
      task.status = 'failed'
      task.error = error instanceof Error ? error.message : '未知错误'
      
      toast.error(`下载失败: ${task.filename}`)

      try {
        if (typeof window !== 'undefined') {
          window.open(task.url, '_blank')
        }
      } catch {}
    } finally {
      // 从活跃下载列表中移除
      this.activeDownloads.delete(task.url)
      this.progressListeners.delete(task.url)
    }
  }

  // 生成文件名
  private generateFilename(result: TaskResult, config: DownloadConfig, taskName?: string): string {
    const now = new Date()
    const timestamp = String(Date.now()) // 使用毫秒时间戳，避免时区歧义
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
      activeDownloads: this.activeDownloads.size,
      maxConcurrent: this.maxConcurrentDownloads
    }
  }

  // 获取活跃下载任务
  getActiveDownloads(): DownloadTask[] {
    return Array.from(this.activeDownloads.values())
  }

  // 重试下载任务
  retryDownload(taskId: string, taskName?: string): void {
    // 查找失败的任务
    const tasks = storage.getBatchTasks()
    let found = false
    
    for (const t of tasks) {
      const result = t.results.find(r => r.id === taskId)
      if (result && !result.downloaded) {
        found = true
        this.addDownload(result, taskName)
        break
      }
    }
    
    if (!found) {
      console.warn('Failed to find task for retry:', taskId)
    }
  }

  // 批量重试失败的任务
  retryFailedDownloads(taskId?: string): void {
    const tasks = storage.getBatchTasks()
    let retryCount = 0
    
    for (const t of tasks) {
      if (taskId && t.id !== taskId) continue
      
      const failedResults = t.results.filter(r => !r.downloaded)
      if (failedResults.length > 0) {
        failedResults.forEach(result => {
          this.addDownload(result, t.name)
          retryCount++
        })
      }
      
      if (taskId) break // 如果指定了任务ID，只处理这个任务
    }
    
    if (retryCount > 0) {
      toast.success(`开始重试 ${retryCount} 个下载失败的任务`)
    } else {
      toast.info('没有需要重试的下载任务')
    }
  }

  // 重新下载所有任务
  retryAllDownloads(): void {
    const tasks = storage.getBatchTasks()
    let retryCount = 0
    
    for (const t of tasks) {
      t.results.forEach(result => {
        this.addDownload(result, t.name)
        retryCount++
      })
    }
    
    if (retryCount > 0) {
      toast.success(`开始重新下载 ${retryCount} 个任务`)
    } else {
      toast.info('没有找到可下载的任务')
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
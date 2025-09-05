import { TaskResult, DownloadConfig } from '@/types'
import { storage } from './storage'
import { sqliteStorage } from './sqlite-storage'
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
  addDownload(result: TaskResult, taskName?: string): boolean {
    const config = storage.getDownloadConfig()
    const filename = this.generateFilename(result, config, taskName)

    // 检查是否已经在下载队列中或正在下载
    const existingTask = this.downloadQueue.find(t => t.url === result.imageUrl) ||
                        Array.from(this.activeDownloads.values()).find(t => t.url === result.imageUrl)
    
    if (existingTask) {
      console.log('Download task already exists:', result.imageUrl)
      return false
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
    // 事件：加入队列
    try { if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('download:enqueued', { detail: { url: task.url } })) } catch {}
    return true
  }

  // 批量添加下载任务
  addBatchDownload(results: TaskResult[], taskName?: string): string[] {
    const config = storage.getDownloadConfig()
    const addedUrls: string[] = []
    
    results.forEach(result => {
      // 检查是否已经在下载队列中或正在下载
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
      addedUrls.push(task.url)
      try { if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('download:enqueued', { detail: { url: task.url } })) } catch {}
    })

    // 如果没有正在下载，开始下载
    if (!this.isDownloading) {
      this.startDownload()
    }
    return addedUrls
  }

  // 开始下载队列 - 完全异步，不阻塞UI
  private startDownload(): void {
    if (this.isDownloading || this.downloadQueue.length === 0) {
      return
    }

    this.isDownloading = true
    console.log('🚀 开始异步下载，不阻塞UI')
    
    // 事件：开始下载
    try { if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('download:start')) } catch {}

    // 使用 requestIdleCallback 或 setTimeout 确保不阻塞UI
    const startDownloadWorker = () => {
      const workers = Math.min(this.maxConcurrentDownloads, this.downloadQueue.length)
      
      for (let i = 0; i < workers; i++) {
        this.processDownloadQueue()
      }
    }

    // 使用 requestIdleCallback 如果可用，否则使用 setTimeout
    if (typeof window !== 'undefined' && window.requestIdleCallback) {
      window.requestIdleCallback(startDownloadWorker, { timeout: 100 })
    } else {
      setTimeout(startDownloadWorker, 0)
    }
  }

  // 处理下载队列 - 完全异步
  private processDownloadQueue(): void {
    if (this.downloadQueue.length === 0) {
      this.isDownloading = false
      try { if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('download:done')) } catch {}
      return
    }

    const task = this.downloadQueue.shift()
    if (!task) {
      this.processDownloadQueue()
      return
    }

    // 使用 setTimeout 确保不阻塞UI
    setTimeout(() => {
      this.downloadFile(task).finally(() => {
        // 继续处理下一个任务
        this.processDownloadQueue()
      })
    }, 0)
  }

  // 下载单个文件
  private async downloadFile(task: DownloadTask): Promise<void> {
    // 添加到活跃下载列表
    this.activeDownloads.set(task.url, task)
    task.status = 'downloading'
    task.progress = 0
    try { if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('download:start', { detail: { url: task.url } })) } catch {}

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

        console.log('[download] using tauri invoke', { url: task.url, filename: filenameWithDirs, dir: baseDir })
        const savedPath = await tauriInvoke('download_file', {
          url: task.url,
          filename: filenameWithDirs,
          dir: baseDir
        }) as string

        console.log('[download] tauri invoke result:', { savedPath, type: typeof savedPath })

        // 更新任务状态
        task.status = 'completed'
        task.progress = 1
        try { if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('download:done', { detail: { url: task.url, path: savedPath } })) } catch {}

        // 写回任务结果：标记已下载与本地路径
        try {
          console.log('[download] 开始更新本地路径:', { taskId: task.id, savedPath })
          const tasks = await sqliteStorage.getBatchTasks()
          console.log('[download] 获取到的任务数量:', tasks.length)
          let updated = false
          for (const t of tasks) {
            console.log('[download] 检查任务:', { taskId: t.id, resultsCount: t.results.length })
            const r = t.results.find(r => r.id === task.id)
            if (r) {
              console.log('[download] 找到匹配的结果:', { resultId: r.id, currentLocalPath: r.localPath })
              // 使用后端返回的完整路径（savedPath 已经是绝对路径）
              r.localPath = savedPath
              r.downloaded = true
              updated = true
              await sqliteStorage.saveBatchTask(t)
              console.log('[download] 更新本地路径成功:', { id: task.id, localPath: savedPath })
              
              // 发送下载完成事件，通知前端刷新
              if (typeof window !== 'undefined') {
                console.log('[download] 发送下载完成事件:', { taskId: t.id, resultId: task.id, localPath: savedPath })
                window.dispatchEvent(new CustomEvent('download:complete', {
                  detail: {
                    taskId: t.id,
                    resultId: task.id,
                    localPath: savedPath,
                    imageUrl: task.url
                  }
                }))
              }
              break
            }
          }
          if (!updated) {
            console.warn('[download] 未找到匹配的 TaskResult 以写回本地路径', { taskId: task.id, allTaskIds: tasks.map(t => t.id) })
          }
        } catch (e) {
          console.error('[download] 写回本地路径失败', e)
        }

        // 可选：交由上层统一提示
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
      try { if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('download:done', { detail: { url: task.url } })) } catch {}

      console.log(`文件已下载: ${task.filename}`)

    } catch (error) {
      console.error(`下载失败 ${task.filename}:`, error)
      task.status = 'failed'
      task.error = error instanceof Error ? error.message : '未知错误'
      try { if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('download:error', { detail: { url: task.url, error: task.error } })) } catch {}

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
  async retryDownload(taskId: string, taskName?: string): Promise<void> {
    // 查找失败的任务
    const tasks = await sqliteStorage.getBatchTasks()
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
  async retryFailedDownloads(taskId?: string): Promise<void> {
    const tasks = await sqliteStorage.getBatchTasks()
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
  async retryAllDownloads(): Promise<void> {
    const tasks = await sqliteStorage.getBatchTasks()
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
    try { if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('download:cancelled')) } catch {}
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
import { BatchTask, BatchTaskStatus, TaskItem, TaskResult, BatchTaskConfig, ModelConfig, TaskType, DebugLog } from '@/types'
import { api } from './api'
import { fileDownloadManager } from './file-download-manager'
import { downloadService } from './download-service'
import { sqliteStorage } from './sqlite-storage'
import { storage } from './storage'
import { v4 as uuidv4 } from 'uuid'
import { toast } from 'sonner'

export class BatchTaskManager {
  private tasks: Map<string, BatchTask> = new Map()
  private activeTasks: Set<string> = new Set()
  private processingQueue: TaskItem[] = []
  private maxConcurrency: number = 3
  private eventListeners: Map<string, ((task: BatchTask) => void)[]> = new Map()

  constructor(maxConcurrency: number = 3) {
    this.maxConcurrency = maxConcurrency
    // 延迟加载，避免SSR问题
    if (typeof window !== 'undefined') {
      this.loadTasksFromStorage()
    }
  }

  // 保存任务到存储
  private async saveTaskToStorage(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId)
    if (!task) return
    
    try {
      await sqliteStorage.saveBatchTask(task)
    } catch (error) {
      console.error('保存任务失败:', error)
      // 即使保存失败，也继续执行，但记录错误
    }
  }

  // 从存储中加载任务
  private async loadTasksFromStorage(): Promise<void> {
    try {
      const savedTasks = await sqliteStorage.getBatchTasks()
      savedTasks.forEach(task => {
        // 应用重启后，重置所有执行中的任务状态
        if (task.status === BatchTaskStatus.PROCESSING) {
          task.status = BatchTaskStatus.FAILED
          task.error = '应用重启，任务已中断'
          
          // 重置所有执行中的子任务
          task.items.forEach(item => {
            if (item.status === BatchTaskStatus.PROCESSING) {
              item.status = BatchTaskStatus.FAILED
              item.error = '应用重启，任务已中断'
            }
          })
          
          // 保存更新后的任务状态
          this.saveTaskToStorage(task.id)
        } else if (task.status === BatchTaskStatus.PAUSED) {
          // 暂停的任务保持暂停状态，但重置执行中的子任务
          task.items.forEach(item => {
            if (item.status === BatchTaskStatus.PROCESSING) {
              item.status = BatchTaskStatus.FAILED
              item.error = '应用重启，任务已中断'
            }
          })
          
          // 保存更新后的任务状态
          this.saveTaskToStorage(task.id)
        }
        
        this.tasks.set(task.id, task)
      })
    } catch (error) {
      console.error('从存储加载任务失败:', error)
    }
  }

  // 创建批量任务
  createTask(
    name: string,
    items: Omit<TaskItem, 'id' | 'status' | 'attemptCount' | 'createdAt'>[],
    config: BatchTaskConfig,
    type: TaskType = TaskType.TEXT_TO_IMAGE
  ): string {
    const taskId = uuidv4()
    const task: BatchTask = {
      id: taskId,
      name,
      type,
      status: BatchTaskStatus.PENDING,
      progress: 0,
      totalItems: items.length,
      completedItems: 0,
      failedItems: 0,
      createdAt: new Date().toISOString(),
      config,
      items: items.map(item => ({
        ...item,
        id: uuidv4(),
        status: BatchTaskStatus.PENDING,
        attemptCount: 0,
        createdAt: new Date().toISOString()
      })),
      results: []
    }

    this.tasks.set(taskId, task)
    this.emitTaskUpdate(taskId)
    
    // 保存任务到存储
    try {
      sqliteStorage.saveBatchTask(task).catch(error => {
        console.error('保存任务失败:', error)
      })
    } catch (error) {
      console.error('保存任务失败:', error)
      // 即使保存失败，也继续执行，但记录错误
    }
    
    return taskId
  }

  // 开始执行任务
  async startTask(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId)
    if (!task || task.status !== BatchTaskStatus.PENDING) {
      return
    }

    task.status = BatchTaskStatus.PROCESSING
    task.startedAt = new Date().toISOString()
    this.activeTasks.add(taskId)
    this.emitTaskUpdate(taskId)

    // 将任务项添加到处理队列
    this.processingQueue.push(...task.items)

    // 开始处理任务
    this.processTaskQueue(taskId)
  }

  // 暂停任务
  pauseTask(taskId: string): void {
    const task = this.tasks.get(taskId)
    if (!task || task.status !== BatchTaskStatus.PROCESSING) {
      return
    }

    task.status = BatchTaskStatus.PAUSED
    this.activeTasks.delete(taskId)

    // 重置所有正在处理的任务项状态为等待中
    task.items.forEach(item => {
      if (item.status === BatchTaskStatus.PROCESSING) {
        item.status = BatchTaskStatus.PENDING
      }
    })

    // 从队列中移除该任务的所有项
    this.processingQueue = this.processingQueue.filter(item =>
      !task.items.some(taskItem => taskItem.id === item.id)
    )

    this.emitTaskUpdate(taskId)
    this.saveTaskToStorage(taskId)
  }

  // 恢复任务
  async resumeTask(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId)
    if (!task || task.status !== BatchTaskStatus.PAUSED) {
      return
    }

    task.status = BatchTaskStatus.PROCESSING
    this.activeTasks.add(taskId)
    
    // 重新计算进度
    task.completedItems = task.items.filter(item => item.status === BatchTaskStatus.COMPLETED).length
    task.failedItems = task.items.filter(item => item.status === BatchTaskStatus.FAILED).length
    task.progress = Math.round(((task.completedItems + task.failedItems) / task.totalItems) * 100)
    
    this.emitTaskUpdate(taskId)

    // 继续处理任务
    this.processTaskQueue(taskId)
  }

  // 停止任务
  stopTask(taskId: string): void {
    const task = this.tasks.get(taskId)
    if (!task || (task.status !== BatchTaskStatus.PROCESSING && task.status !== BatchTaskStatus.PAUSED)) {
      return
    }

    task.status = BatchTaskStatus.CANCELLED
    this.activeTasks.delete(taskId)

    // 从队列中移除该任务的所有项
    this.processingQueue = this.processingQueue.filter(item =>
      !task.items.some(taskItem => taskItem.id === item.id)
    )

    this.emitTaskUpdate(taskId)
    this.saveTaskToStorage(taskId)
  }

  // 重试任务（重新开始执行）
  async retryTask(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId)
    if (!task) return

    // 重置任务状态
    task.status = BatchTaskStatus.PENDING
    task.progress = 0
    task.completedItems = 0
    task.failedItems = 0
    task.startedAt = undefined
    task.completedAt = undefined
    task.error = undefined

    // 重置所有任务项状态
    task.items.forEach(item => {
      item.status = BatchTaskStatus.PENDING
      item.attemptCount = 0
      item.error = undefined
      item.processedAt = undefined
    })

    // 清空结果
    task.results = []

    this.emitTaskUpdate(taskId)
    await this.saveTaskToStorage(taskId)

    // 开始执行任务
    await this.startTask(taskId)
  }

  // 重试失败的任务项
  async retryFailedItems(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId)
    if (!task) return

    // 重置失败的任务项
    task.items.forEach(item => {
      if (item.status === BatchTaskStatus.FAILED) {
        item.status = BatchTaskStatus.PENDING
        item.attemptCount = 0
        item.error = undefined
        item.processedAt = undefined
      }
    })

    // 重新计算进度
    task.completedItems = task.items.filter(item => item.status === BatchTaskStatus.COMPLETED).length
    task.failedItems = task.items.filter(item => item.status === BatchTaskStatus.FAILED).length
    task.progress = Math.round(((task.completedItems + task.failedItems) / task.totalItems) * 100)

    // 如果任务已完成，重新开始
    if (task.status === BatchTaskStatus.COMPLETED || task.status === BatchTaskStatus.FAILED) {
      task.status = BatchTaskStatus.PROCESSING
      task.startedAt = new Date().toISOString()
      this.activeTasks.add(taskId)
    }

    this.emitTaskUpdate(taskId)
    await this.saveTaskToStorage(taskId)

    // 继续处理任务
    this.processTaskQueue(taskId)
  }

  // 重试单个任务项
  async retryTaskItem(taskId: string, itemId: string): Promise<void> {
    const task = this.tasks.get(taskId)
    if (!task) return

    const item = task.items.find(i => i.id === itemId)
    if (!item) return

    // 重置任务项状态
    item.status = BatchTaskStatus.PENDING
    item.attemptCount = 0
    item.error = undefined
    item.processedAt = undefined

    // 重新计算进度
    task.completedItems = task.items.filter(item => item.status === BatchTaskStatus.COMPLETED).length
    task.failedItems = task.items.filter(item => item.status === BatchTaskStatus.FAILED).length
    task.progress = Math.round(((task.completedItems + task.failedItems) / task.totalItems) * 100)

    // 如果任务已完成，重新开始
    if (task.status === BatchTaskStatus.COMPLETED || task.status === BatchTaskStatus.FAILED) {
      task.status = BatchTaskStatus.PROCESSING
      task.startedAt = new Date().toISOString()
      this.activeTasks.add(taskId)
    }

    this.emitTaskUpdate(taskId)
    await this.saveTaskToStorage(taskId)

    // 继续处理任务
    this.processTaskQueue(taskId)
  }

  // 删除任务
  deleteTask(taskId: string): void {
    const task = this.tasks.get(taskId)
    if (!task) return

    if (task.status === BatchTaskStatus.PROCESSING || task.status === BatchTaskStatus.PAUSED) {
      this.stopTask(taskId)
    }

    this.tasks.delete(taskId)
    this.eventListeners.delete(taskId)
    // 从存储中删除任务
    sqliteStorage.removeBatchTask(taskId).catch(error => {
      console.error('删除任务失败:', error)
    })
  }

  // 获取任务
  getTask(taskId: string): BatchTask | undefined {
    return this.tasks.get(taskId)
  }

  // 获取所有任务
  getAllTasks(): BatchTask[] {
    return Array.from(this.tasks.values()).sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
  }

  // 获取活跃任务
  getActiveTasks(): BatchTask[] {
    return Array.from(this.activeTasks).map(id => this.tasks.get(id)!).filter(Boolean)
  }

  // 监听任务更新
  onTaskUpdate(taskId: string, listener: (task: BatchTask) => void): () => void {
    if (!this.eventListeners.has(taskId)) {
      this.eventListeners.set(taskId, [])
    }
    this.eventListeners.get(taskId)!.push(listener)

    return () => {
      const listeners = this.eventListeners.get(taskId)
      if (listeners) {
        const index = listeners.indexOf(listener)
        if (index > -1) {
          listeners.splice(index, 1)
        }
      }
    }
  }

  // 私有方法：处理任务队列
  private async processTaskQueue(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId)
    if (!task || task.status !== BatchTaskStatus.PROCESSING) {
      return
    }

    // 检查任务是否还在活跃任务列表中
    if (!this.activeTasks.has(taskId)) {
      return
    }

    const activeWorkers = task.items.filter(item =>
      item.status === BatchTaskStatus.PROCESSING
    ).length

    if (activeWorkers >= task.config.concurrentLimit) {
      return
    }

    const pendingItems = task.items.filter(item =>
      item.status === BatchTaskStatus.PENDING ||
      (item.status === BatchTaskStatus.FAILED && item.attemptCount < task.config.retryAttempts)
    )

    if (pendingItems.length === 0) {
      this.completeTask(taskId)
      return
    }

    const itemsToProcess = pendingItems.slice(0, task.config.concurrentLimit - activeWorkers)

    for (const item of itemsToProcess) {
      this.processTaskItem(taskId, item.id)
    }
  }

  // 私有方法：处理单个任务项
  private async processTaskItem(taskId: string, itemId: string): Promise<void> {
    const task = this.tasks.get(taskId)
    if (!task) return

    const item = task.items.find(i => i.id === itemId)
    if (!item || item.status === BatchTaskStatus.PROCESSING) return

    item.status = BatchTaskStatus.PROCESSING
    item.attemptCount++
    item.processedAt = new Date().toISOString()
    this.emitTaskUpdate(taskId)
    
    // 保存任务状态更新
    this.saveTaskToStorage(taskId)

    const startedAtMs = Date.now()
    try {
      const result = await this.executeTaskItem(item, task.config)
      const durationMs = Date.now() - startedAtMs

      // 创建结果记录
      const taskResult: TaskResult = {
        id: uuidv4(),
        taskItemId: item.id,
        imageUrl: result.imageUrl,
        downloaded: false,
        createdAt: new Date().toISOString(),
        durationMs
      }

      task.results.push(taskResult)
      item.status = BatchTaskStatus.COMPLETED
      task.completedItems++

      // 如果启用了自动下载，异步下载图片（不阻塞任务处理）
      if (task.config.autoDownload) {
        // 使用 setTimeout 确保不阻塞UI
        setTimeout(() => {
          this.downloadImage(taskResult, task).catch(error => {
            console.error('下载图片失败:', error)
          })
        }, 0)
      }

    } catch (error) {
      console.error(`Task item ${itemId} failed:`, error)
      item.status = BatchTaskStatus.FAILED
      item.error = error instanceof Error ? error.message : String(error)
      task.failedItems++

      // 如果还有重试次数，继续处理
      if (item.attemptCount < task.config.retryAttempts) {
        item.status = BatchTaskStatus.PENDING
        setTimeout(() => {
          this.processTaskQueue(taskId)
        }, task.config.retryDelay)
        return
      }
    }

    // 更新进度
    task.progress = Math.round(((task.completedItems + task.failedItems) / task.totalItems) * 100)
    this.emitTaskUpdate(taskId)
    
    // 保存任务状态更新
    this.saveTaskToStorage(taskId)

    // 继续处理队列
    setTimeout(() => {
      this.processTaskQueue(taskId)
    }, 100)
  }

  // 私有方法：执行单个任务项
  private async executeTaskItem(item: TaskItem, config: BatchTaskConfig): Promise<{ imageUrl: string }> {
    // 检查API配置
    const apiConfig = storage.getApiConfig()
    if (!apiConfig || !apiConfig.key || !apiConfig.baseUrl) {
      console.error('API配置缺失:', apiConfig)
      throw new Error('请先设置 API 配置')
    }

    console.log('开始执行任务项:', item.prompt, '模型:', config.model, '类型:', config.modelType)

          const request = {
        prompt: item.prompt,
        model: config.model,
        modelType: config.modelType,
        sourceImage: item.sourceImage,
        isImageToImage: !!item.sourceImage,
        aspectRatio: config.aspectRatio,
        size: config.size,
        n: config.generateCount && config.generateCount > 0 ? config.generateCount : 1,
        quality: config.quality,
        mask: item.mask,
        timeoutMs: config.apiTimeoutMs ?? 300000
      }

    // 记录请求日志
    const requestLog: DebugLog = {
      id: uuidv4(),
      taskItemId: item.id,
      timestamp: new Date().toISOString(),
      type: 'request',
      data: request
    }
    
    if (!item.debugLogs) {
      item.debugLogs = []
    }
    item.debugLogs.push(requestLog)

      let response: any
    let startTime = Date.now()
    
    try {
      // 根据模型类型调用不同的API
      if (config.modelType === 'dalle') {
        if (item.sourceImage) {
          response = await api.editDalleImage(request)
        } else {
          response = await api.generateDalleImage(request)
        }
      } else if (config.modelType === 'gemini') {
        if (item.sourceImage) {
          response = await api.editGeminiImage(request)
        } else {
          response = await api.generateGeminiImage(request)
        }
      } else {
        // OpenAI 流式API
        return new Promise((resolve, reject) => {
          api.generateStreamImage(request, {
            onMessage: () => {},
            onComplete: (imageUrl: string) => {
              // 记录响应日志
              const responseLog: DebugLog = {
                id: uuidv4(),
                taskItemId: item.id,
                timestamp: new Date().toISOString(),
                type: 'response',
                data: { imageUrl },
                duration: Date.now() - startTime
              }
              item.debugLogs?.push(responseLog)
              resolve({ imageUrl })
            },
            onError: (error: string) => {
              // 记录错误日志
              const errorLog: DebugLog = {
                id: uuidv4(),
                taskItemId: item.id,
                timestamp: new Date().toISOString(),
                type: 'error',
                data: { error },
                duration: Date.now() - startTime
              }
              item.debugLogs?.push(errorLog)
              reject(new Error(error))
            }
          })
        })
      }
      
      // 记录响应日志
      const responseLog: DebugLog = {
        id: uuidv4(),
        taskItemId: item.id,
        timestamp: new Date().toISOString(),
        type: 'response',
        data: response,
        duration: Date.now() - startTime
      }
      item.debugLogs?.push(responseLog)
      
      if (config.modelType === 'dalle') {
        return { imageUrl: (response.data[0]?.url || response.data[0]?.b64_json || '') as string }
      } else {
        return { imageUrl: `data:image/png;base64,${response.data[0]?.b64_json}` }
      }
      
    } catch (error) {
      // 记录错误日志
      const errorLog: DebugLog = {
        id: uuidv4(),
        taskItemId: item.id,
        timestamp: new Date().toISOString(),
        type: 'error',
        data: { error: error instanceof Error ? error.message : String(error) },
        duration: Date.now() - startTime
      }
      item.debugLogs?.push(errorLog)
      throw error
    }
  }

  // 私有方法：下载图片
  private async downloadImage(result: TaskResult, task: BatchTask): Promise<void> {
    try {
      // 使用统一的下载服务
      const success = await downloadService.downloadImage(result.imageUrl, {
        taskName: task.name,
        showToast: false // 批量任务不显示单独的toast
      })
      
      if (success) {
        result.downloaded = true
        // localPath 会在文件下载管理器下载完成后自动更新
        // 这里不再硬编码本地路径，由下载服务处理
      } else {
        console.error('添加下载任务失败:', result.id)
      }
    } catch (error) {
      console.error('添加下载任务失败:', error)
      toast.error(`添加下载任务失败: ${result.id}`)
    }
  }

  // 私有方法：完成任务
  private completeTask(taskId: string): void {
    const task = this.tasks.get(taskId)
    if (!task || task.status !== BatchTaskStatus.PROCESSING) {
      return
    }

    task.status = task.failedItems > 0 && task.completedItems === 0
      ? BatchTaskStatus.FAILED
      : BatchTaskStatus.COMPLETED
    task.completedAt = new Date().toISOString()
    this.activeTasks.delete(taskId)

    this.emitTaskUpdate(taskId)
    this.saveTaskToStorage(taskId)

    const message = task.status === BatchTaskStatus.COMPLETED
      ? `批量任务 "${task.name}" 已完成 (${task.completedItems}/${task.totalItems})`
      : `批量任务 "${task.name}" 已失败 (${task.failedItems} 失败)`

    toast.success(message)
  }

  // 私有方法：触发任务更新事件
  private emitTaskUpdate(taskId: string): void {
    const task = this.tasks.get(taskId)
    if (!task) return

    const listeners = this.eventListeners.get(taskId)
    if (listeners) {
      listeners.forEach(listener => listener({ ...task }))
    }
  }

  // 设置最大并发数
  setMaxConcurrency(concurrency: number): void {
    this.maxConcurrency = Math.max(1, concurrency)
  }


  // 获取统计信息
  getStats(): {
    totalTasks: number
    activeTasks: number
    completedTasks: number
    failedTasks: number
  } {
    const allTasks = Array.from(this.tasks.values())
    return {
      totalTasks: allTasks.length,
      activeTasks: allTasks.filter(t => t.status === BatchTaskStatus.PROCESSING).length,
      completedTasks: allTasks.filter(t => t.status === BatchTaskStatus.COMPLETED).length,
      failedTasks: allTasks.filter(t => t.status === BatchTaskStatus.FAILED).length
    }
  }
}

// 创建全局任务管理器实例
export const batchTaskManager = new BatchTaskManager(3)
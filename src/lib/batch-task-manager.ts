import { BatchTask, BatchTaskStatus, TaskItem, TaskResult, BatchTaskConfig, ModelConfig, TaskType, DebugLog } from '@/types'
import { api } from './api'
import { fileDownloadManager } from './file-download-manager'
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
    this.loadTasksFromStorage()
  }

  // 从存储中加载任务
  private loadTasksFromStorage(): void {
    const savedTasks = storage.getBatchTasks()
    savedTasks.forEach(task => {
      this.tasks.set(task.id, task)
    })
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

  // 停止任务
  stopTask(taskId: string): void {
    const task = this.tasks.get(taskId)
    if (!task || task.status !== BatchTaskStatus.PROCESSING) {
      return
    }

    task.status = BatchTaskStatus.CANCELLED
    this.activeTasks.delete(taskId)

    // 从队列中移除该任务的所有项
    this.processingQueue = this.processingQueue.filter(item =>
      !task.items.some(taskItem => taskItem.id === item.id)
    )

    this.emitTaskUpdate(taskId)
  }

  // 删除任务
  deleteTask(taskId: string): void {
    const task = this.tasks.get(taskId)
    if (!task) return

    if (task.status === BatchTaskStatus.PROCESSING) {
      this.stopTask(taskId)
    }

    this.tasks.delete(taskId)
    this.eventListeners.delete(taskId)
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

      // 如果启用了自动下载，下载图片
      if (task.config.autoDownload) {
        await this.downloadImage(taskResult, task)
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
      n: 1,
      quality: config.quality,
      mask: item.mask
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
      fileDownloadManager.addDownload(result, task.name)
      result.downloaded = true
      result.localPath = `batch_${task.name}_${result.id}.png`
    } catch (error) {
      console.error('添加下载任务失败:', error)
      toast.error(`添加下载任务失败: ${result.id}`)
    }
  }

  // 私有方法：完成任务
  private completeTask(taskId: string): void {
    const task = this.tasks.get(taskId)
    if (!task) return

    task.status = task.failedItems > 0 && task.completedItems === 0
      ? BatchTaskStatus.FAILED
      : BatchTaskStatus.COMPLETED
    task.completedAt = new Date().toISOString()
    this.activeTasks.delete(taskId)

    this.emitTaskUpdate(taskId)

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

  // 重试失败的任务项
  retryFailedItems(taskId: string): void {
    const task = this.tasks.get(taskId)
    if (!task) return

    let resetCount = 0
    task.items.forEach(item => {
      if (item.status === BatchTaskStatus.FAILED) {
        item.status = BatchTaskStatus.PENDING
        item.error = undefined
        item.attemptCount = 0
        resetCount++
      }
    })

    if (resetCount > 0) {
      task.status = BatchTaskStatus.PENDING
      task.progress = Math.round(((task.completedItems + task.failedItems) / task.totalItems) * 100)
      this.emitTaskUpdate(taskId)
      // 重新开始任务
      this.startTask(taskId)
    }
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
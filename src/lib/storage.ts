import { ApiConfig, GeneratedImage, CustomModel, BatchTask, ModelConfig, DownloadConfig } from "@/types"

const STORAGE_KEYS = {
  API_CONFIG: 'ai-drawing-api-config',
  HISTORY: 'ai-drawing-history',
  CUSTOM_MODELS: 'ai-drawing-custom-models',
  MODEL_CONFIGS: 'ai-drawing-model-configs',
  DOWNLOAD_CONFIG: 'ai-drawing-download-config',
  LICENSE_INFO: 'ai-drawing-license-info'
}

export const storage = {
  // 激活信息
  getLicenseInfo: (): { licenseKey?: string; machineId?: string; activated?: boolean } => {
    if (typeof window === 'undefined') return { activated: false }
    const raw = localStorage.getItem(STORAGE_KEYS.LICENSE_INFO)
    return raw ? JSON.parse(raw) : { activated: false }
  },
  saveLicenseInfo: (info: { licenseKey?: string; machineId?: string; activated?: boolean }) => {
    if (typeof window === 'undefined') return
    localStorage.setItem(STORAGE_KEYS.LICENSE_INFO, JSON.stringify(info))
  },
  isActivated: (): boolean => {
    const lic = storage.getLicenseInfo()
    return !!lic.activated && !!lic.machineId && !!lic.licenseKey
  },
  // API 配置相关操作
  getApiConfig: (): ApiConfig | null => {
    if (typeof window === 'undefined') return null
    const data = localStorage.getItem(STORAGE_KEYS.API_CONFIG)
    return data ? JSON.parse(data) : null
  },

  setApiConfig: (key: string, baseUrl: string): void => {
    if (typeof window === 'undefined') return
    // 保存前校验激活
    if (!storage.isActivated()) {
      throw new Error('尚未激活，无法保存 API 配置')
    }
    // 强制固定 API 基础地址，防止被调试或参数覆盖
    const fixedBaseUrl = 'https://zx1.deepwl.net'
    const apiConfig: ApiConfig = {
      key,
      baseUrl: fixedBaseUrl,
      createdAt: new Date().toISOString()
    }
    localStorage.setItem(STORAGE_KEYS.API_CONFIG, JSON.stringify(apiConfig))
  },

  removeApiConfig: (): void => {
    if (typeof window === 'undefined') return
    localStorage.removeItem(STORAGE_KEYS.API_CONFIG)
  },

  // 历史记录相关操作
  getHistory: (): GeneratedImage[] => {
    if (typeof window === 'undefined') return []
    const data = localStorage.getItem(STORAGE_KEYS.HISTORY)
    return data ? JSON.parse(data) : []
  },

  addToHistory: (image: GeneratedImage): void => {
    if (typeof window === 'undefined') return
    const history = storage.getHistory()
    history.unshift(image)
    localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(history))
  },

  clearHistory: (): void => {
    if (typeof window === 'undefined') return
    localStorage.removeItem(STORAGE_KEYS.HISTORY)
  },

  removeFromHistory: (id: string): void => {
    if (typeof window === 'undefined') return
    const history = storage.getHistory()
    const filtered = history.filter(img => img.id !== id)
    localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(filtered))
  },

  // 自定义模型相关操作
  getCustomModels: (): CustomModel[] => {
    if (typeof window === 'undefined') return []
    const data = localStorage.getItem(STORAGE_KEYS.CUSTOM_MODELS)
    return data ? JSON.parse(data) : []
  },

  addCustomModel: (model: CustomModel): void => {
    if (typeof window === 'undefined') return
    const models = storage.getCustomModels()
    models.push(model)
    localStorage.setItem(STORAGE_KEYS.CUSTOM_MODELS, JSON.stringify(models))
  },

  removeCustomModel: (id: string): void => {
    if (typeof window === 'undefined') return
    const models = storage.getCustomModels()
    const filtered = models.filter(model => model.id !== id)
    localStorage.setItem(STORAGE_KEYS.CUSTOM_MODELS, JSON.stringify(filtered))
  },

  updateCustomModel: (id: string, updated: Partial<CustomModel>): void => {
    if (typeof window === 'undefined') return
    const models = storage.getCustomModels()
    const index = models.findIndex(model => model.id === id)
    if (index !== -1) {
      models[index] = { ...models[index], ...updated }
      localStorage.setItem(STORAGE_KEYS.CUSTOM_MODELS, JSON.stringify(models))
    }
  },


  // 模型配置相关操作
  getModelConfigs: (): ModelConfig[] => {
    if (typeof window === 'undefined') return []
    const data = localStorage.getItem(STORAGE_KEYS.MODEL_CONFIGS)
    return data ? JSON.parse(data) : []
  },

  saveModelConfig: (config: ModelConfig): void => {
    if (typeof window === 'undefined') return
    const configs = storage.getModelConfigs()
    const existingIndex = configs.findIndex(c => c.id === config.id)
    if (existingIndex !== -1) {
      configs[existingIndex] = config
    } else {
      configs.push(config)
    }
    localStorage.setItem(STORAGE_KEYS.MODEL_CONFIGS, JSON.stringify(configs))
  },

  removeModelConfig: (configId: string): void => {
    if (typeof window === 'undefined') return
    const configs = storage.getModelConfigs()
    const filtered = configs.filter(config => config.id !== configId)
    localStorage.setItem(STORAGE_KEYS.MODEL_CONFIGS, JSON.stringify(filtered))
  },

  // 下载配置相关操作
  getDownloadConfig: (): DownloadConfig => {
    if (typeof window === 'undefined') return {
      autoDownload: false,
      defaultPath: '',
      organizeByDate: true,
      organizeByTask: true,
      filenameTemplate: '{task}_{index}_{timestamp}'
    }
    const data = localStorage.getItem(STORAGE_KEYS.DOWNLOAD_CONFIG)
    return data ? JSON.parse(data) : {
      autoDownload: false,
      defaultPath: '',
      organizeByDate: true,
      organizeByTask: true,
      filenameTemplate: '{task}_{index}_{timestamp}'
    }
  },

  saveDownloadConfig: (config: DownloadConfig): void => {
    if (typeof window === 'undefined') return
    localStorage.setItem(STORAGE_KEYS.DOWNLOAD_CONFIG, JSON.stringify(config))
  },

  // 获取存储使用情况
  getStorageUsage: (): { used: number; quota: number; percentage: number } => {
    if (typeof window === 'undefined') return { used: 0, quota: 0, percentage: 0 }
    
    let used = 0
    for (const key in STORAGE_KEYS) {
      const value = localStorage.getItem(STORAGE_KEYS[key as keyof typeof STORAGE_KEYS])
      if (value) {
        used += value.length * 2 // UTF-16 characters use 2 bytes
      }
    }
    
    // 估算配额（不同浏览器不同，通常5-10MB）
    const quota = 5 * 1024 * 1024 // 5MB
    const percentage = Math.round((used / quota) * 100)
    
    return { used, quota, percentage }
  },

  // 检查存储空间是否充足
  hasSufficientStorage: (estimatedSize: number = 0): boolean => {
    if (typeof window === 'undefined') return true
    
    const { used, quota } = storage.getStorageUsage()
    return (used + estimatedSize) < quota * 0.9 // 保留10%缓冲
  },

  // 压缩批量任务数据
  compressBatchTask: (task: BatchTask): BatchTask => {
    const compressedTask = { ...task }
    
    // 压缩调试日志（如果存在）
    if (compressedTask.items) {
      compressedTask.items = compressedTask.items.map(item => ({
        ...item,
        debugLogs: item.debugLogs ? item.debugLogs.slice(-10) : [] // 只保留最近10条日志
      }))
    }
    
    // 清理不必要的结果数据
    if (compressedTask.results) {
      compressedTask.results = compressedTask.results.map(result => ({
        ...result,
        // 移除不需要的字段或进行压缩
      }))
    }
    
    return compressedTask
  },

  // 估算任务大小（字节）
  estimateTaskSize: (task: BatchTask): number => {
    const jsonString = JSON.stringify(task)
    return jsonString.length * 2 // UTF-16 characters use 2 bytes
  },

  // 获取所有存储键的存储使用情况
  getDetailedStorageUsage: () => {
    if (typeof window === 'undefined') return {}
    
    const usage: Record<string, number> = {}
    let total = 0
    
    for (const key in STORAGE_KEYS) {
      const storageKey = STORAGE_KEYS[key as keyof typeof STORAGE_KEYS]
      const value = localStorage.getItem(storageKey)
      if (value) {
        const size = value.length * 2
        usage[storageKey] = size
        total += size
      }
    }
    
    return { usage, total }
  },

  // 智能清理存储空间
  smartCleanup: (targetFreeSpaceMB: number = 2): boolean => {
    if (typeof window === 'undefined') return false
    
    const targetBytes = targetFreeSpaceMB * 1024 * 1024
    const usageInfo = storage.getDetailedStorageUsage()
    const currentFreeSpace = (5 * 1024 * 1024) - (usageInfo.total || 0) // 假设5MB配额
    
    if (currentFreeSpace >= targetBytes) {
      return false // 不需要清理
    }
    
    const neededBytes = targetBytes - currentFreeSpace
    let freedBytes = 0
    
    // 清理策略：按优先级清理
    const cleanupPriorities = [
      STORAGE_KEYS.HISTORY,          // 历史记录
      STORAGE_KEYS.CUSTOM_MODELS,    // 自定义模型
      STORAGE_KEYS.MODEL_CONFIGS,    // 模型配置
    ]
    
    for (const key of cleanupPriorities) {
      if (freedBytes >= neededBytes) break
      
      const value = localStorage.getItem(key)
      if (value) {
        const size = value.length * 2
        localStorage.removeItem(key)
        freedBytes += size
        console.log(`清理了 ${key}，释放了 ${(size / 1024 / 1024).toFixed(2)}MB`)
      }
    }
    
    return freedBytes > 0
  },

} 
import { ApiConfig, GeneratedImage, CustomModel, BatchTask, ModelConfig, DownloadConfig } from "@/types"

const STORAGE_KEYS = {
  API_CONFIG: 'ai-drawing-api-config',
  HISTORY: 'ai-drawing-history',
  CUSTOM_MODELS: 'ai-drawing-custom-models',
  BATCH_TASKS: 'ai-drawing-batch-tasks',
  MODEL_CONFIGS: 'ai-drawing-model-configs',
  DOWNLOAD_CONFIG: 'ai-drawing-download-config'
}

export const storage = {
  // API 配置相关操作
  getApiConfig: (): ApiConfig | null => {
    if (typeof window === 'undefined') return null
    const data = localStorage.getItem(STORAGE_KEYS.API_CONFIG)
    return data ? JSON.parse(data) : null
  },

  setApiConfig: (key: string, baseUrl: string): void => {
    if (typeof window === 'undefined') return
    const apiConfig: ApiConfig = {
      key,
      baseUrl,
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

  // 批量任务相关操作
  getBatchTasks: (): BatchTask[] => {
    if (typeof window === 'undefined') return []
    const data = localStorage.getItem(STORAGE_KEYS.BATCH_TASKS)
    return data ? JSON.parse(data) : []
  },

  saveBatchTask: (task: BatchTask): void => {
    if (typeof window === 'undefined') return
    const tasks = storage.getBatchTasks()
    const existingIndex = tasks.findIndex(t => t.id === task.id)
    if (existingIndex !== -1) {
      tasks[existingIndex] = task
    } else {
      tasks.push(task)
    }
    localStorage.setItem(STORAGE_KEYS.BATCH_TASKS, JSON.stringify(tasks))
  },

  removeBatchTask: (taskId: string): void => {
    if (typeof window === 'undefined') return
    const tasks = storage.getBatchTasks()
    const filtered = tasks.filter(task => task.id !== taskId)
    localStorage.setItem(STORAGE_KEYS.BATCH_TASKS, JSON.stringify(filtered))
  },

  clearBatchTasks: (): void => {
    if (typeof window === 'undefined') return
    localStorage.removeItem(STORAGE_KEYS.BATCH_TASKS)
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
  }
} 
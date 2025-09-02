export interface GeneratedImage {
  id: string
  prompt: string
  url: string
  model: string
  createdAt: string
  aspectRatio: string
}

export interface ApiConfig {
  key: string
  baseUrl: string
  createdAt: string
  lastUsed?: string
}

export interface DalleImageData {
  url?: string
  b64_json?: string
}

// 模型类型枚举
export enum ModelType {
  DALLE = 'dalle',
  OPENAI = 'openai',
  GEMINI = 'gemini'
}

// 自定义模型接口
export interface CustomModel {
  id: string
  name: string
  value: string
  type: ModelType
  createdAt: string
}

export type GenerationModel = 'sora_image' | 'gpt_4o_image' | 'gpt-image-1' | 'dall-e-3' | 'gemini-2.5-flash-image-preview' | string
export type AspectRatio = '1:1' | '16:9' | '9:16'
export type ImageSize = '1024x1024' | '1536x1024' | '1024x1536' | 'auto' | '1792x1024'

export interface GenerateImageRequest {
  prompt: string
  model: GenerationModel
  modelType?: ModelType
  sourceImage?: string
  sourceImages?: string[]
  isImageToImage?: boolean
  aspectRatio?: AspectRatio
  size?: ImageSize
  n?: number
  quality?: 'auto' | 'high' | 'medium' | 'low' | 'hd' | 'standard'
  mask?: string
}

// 批量任务相关类型
export enum BatchTaskStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

export enum TaskType {
  TEXT_TO_IMAGE = 'text_to_image',
  IMAGE_TO_IMAGE = 'image_to_image',
  MIXED = 'mixed'
}

export interface BatchTask {
  id: string
  name: string
  type: TaskType
  status: BatchTaskStatus
  progress: number
  totalItems: number
  completedItems: number
  failedItems: number
  createdAt: string
  startedAt?: string
  completedAt?: string
  config: BatchTaskConfig
  items: TaskItem[]
  results: TaskResult[]
  error?: string
}

export interface BatchTaskConfig {
  model: GenerationModel
  modelType: ModelType
  concurrentLimit: number
  retryAttempts: number
  retryDelay: number
  autoDownload: boolean
  downloadPath?: string
  aspectRatio: AspectRatio
  size: ImageSize
  quality: 'auto' | 'high' | 'medium' | 'low' | 'hd' | 'standard'
  generateCount?: number // 新增：每个提示词的生成次数
}

export interface TaskItem {
  id: string
  prompt: string
  sourceImage?: string
  mask?: string
  priority: number
  status: BatchTaskStatus
  attemptCount: number
  createdAt: string
  processedAt?: string
  error?: string
  debugLogs?: DebugLog[]
}

export interface TaskResult {
  id: string
  taskItemId: string
  imageUrl: string
  localPath?: string
  downloaded: boolean
  createdAt: string
  durationMs?: number
}

export interface BatchQueue {
  id: string
  name: string
  tasks: BatchTask[]
  maxConcurrency: number
  isActive: boolean
  createdAt: string
}

export interface ModelConfig {
  id: string
  name: string
  model: GenerationModel
  modelType: ModelType
  apiKey: string
  baseUrl: string
  rateLimit?: number
  timeout?: number
  enabled: boolean
  createdAt: string
  lastUsed?: string
}

export interface DownloadConfig {
  autoDownload: boolean
  defaultPath: string
  organizeByDate: boolean
  organizeByTask: boolean
  filenameTemplate: string
} 

export interface DebugLog {
  id: string
  taskItemId: string
  timestamp: string
  type: 'request' | 'response' | 'error'
  data: any
  duration?: number
} 
export interface GeneratedImage {
  id: string
  prompt: string
  url: string
  model: string
  createdAt: string
  aspectRatio: string
  type?: 'image' | 'video'
  videoUrl?: string
  duration?: string
  status?: 'loading' | 'success' | 'failed' | 'queued'
}

export interface GenerationResult {
  id: string
  status: 'loading' | 'success' | 'failed' | 'queued'
  url?: string
  videoUrl?: string
  model: string
  duration?: string
  error?: string
  aspectRatio: string
  type: 'image' | 'video'
  progress?: number
  isPlaceholder?: boolean
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
  GEMINI = 'gemini',
  MJ = 'mj',
  OPENAI_VIDEO = 'openai_video'
}

// 自定义模型接口
export interface CustomModel {
  id: string
  name: string
  value: string
  type: ModelType
  createdAt: string
}

export type GenerationModel = 'sora_image' | 'gemini-2.5-flash-image-preview' | 'gemini-3-pro-image-preview' | string
export type AspectRatio = '1:1' | '16:9' | '9:16' | string
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
  quality?: 'auto' | 'high' | 'medium' | 'low' | 'hd' | 'standard' | '1K' | '2K' | '4K'
  mask?: string
}

export type VideoStyle = 'thanksgiving' | 'comic' | 'news' | 'selfie' | 'nostalgic' | 'anime' | string

export interface GenerateVideoRequest {
  prompt: string
  model: string
  input_reference?: File | Blob // base64 string or File
  source_images?: string[] // array of base64 strings or URLs
  seconds?: string
  size?: string
  character_url?: string
  character_timestamps?: string // "start,end"
  watermark?: boolean
  character_from_task?: string
  character_create?: boolean
  style?: VideoStyle
}

export interface VideoTaskResponse {
  id: string
  object: string
  model: string
  status: string
  progress: number
  created_at: number
  size?: string
  seconds?: string
  quality?: string
  video_url?: string
  completed_at?: number
  detail?: any
  character?: any
}
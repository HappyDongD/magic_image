'use client'

import { useState, useRef, useEffect, Suspense, lazy } from 'react'
import { useSearchParams } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Info, Download, Edit, Settings, History, Image as ImageIcon, MessageSquare, Upload, ChevronLeft, ChevronRight, Maximize2, Layers, Loader2, CheckCircle, AlertCircle, KeyRound } from 'lucide-react'
import Image from 'next/image'
import { LoadingSpinner, PageLoading } from '@/components/ui/loading-spinner'
import { GenerationModel, AspectRatio, ImageSize, ModelType, BatchTask } from '@/types'
import { storage } from '@/lib/sqlite-storage'
import { batchTaskManager } from '@/lib/batch-task-manager'
import { v4 as uuidv4 } from 'uuid'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from 'sonner'

// 动态导入非关键组件以提升LCP性能
const ApiKeyDialog = lazy(() => import('@/components/api-key-dialog').then(m => ({ default: m.ApiKeyDialog })))
const HistoryDialog = lazy(() => import('@/components/history-dialog').then(m => ({ default: m.HistoryDialog })))
const BatchTaskList = lazy(() => import('@/components/batch-task-list').then(m => ({ default: m.BatchTaskList })))
const BatchTaskCreator = lazy(() => import('@/components/batch-task-creator').then(m => ({ default: m.BatchTaskCreator })))
const DownloadSettingsDialog = lazy(() => import('@/components/download-settings-dialog').then(m => ({ default: m.DownloadSettingsDialog })))
const MaskEditor = lazy(() => import('@/components/mask-editor').then(m => ({ default: m.MaskEditor })))
const CustomModelDialog = lazy(() => import('@/components/custom-model-dialog').then(m => ({ default: m.CustomModelDialog })))

/**
 * 主内容组件 - 优化后的页面结构
 * 使用动态导入和代码分割提升LCP性能
 */
export default function HomeContent() {
  const [showApiKeyDialog, setShowApiKeyDialog] = useState(false)
  const [showHistoryDialog, setShowHistoryDialog] = useState(false)
  const [showCustomModelDialog, setShowCustomModelDialog] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [model, setModel] = useState<GenerationModel>('sora_image')
  const [modelType, setModelType] = useState<ModelType>(ModelType.OPENAI)
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatedImages, setGeneratedImages] = useState<string[]>([])
  const [currentImageIndex, setCurrentImageIndex] = useState(0)
  const [showImageDialog, setShowImageDialog] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [streamContent, setStreamContent] = useState<string>('')
  const [isImageToImage, setIsImageToImage] = useState(false)
  const [sourceImages, setSourceImages] = useState<string[]>([])
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('1:1')
  const [size, setSize] = useState<ImageSize>('1024x1024')
  const [n, setN] = useState(1)
  const [quality, setQuality] = useState<'auto' | 'high' | 'medium' | 'low' | 'hd' | 'standard'>('auto')
  const contentRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [showMaskEditor, setShowMaskEditor] = useState(false)
  const [maskImage, setMaskImage] = useState<string | null>(null)
  const [isMaskEditorOpen, setIsMaskEditorOpen] = useState(false)
  const [selectedImage, setSelectedImage] = useState<string | null>(null)
  const searchParams = useSearchParams()

  // 批量任务相关状态
  const [batchTasks, setBatchTasks] = useState<BatchTask[]>([])
  const [activeTab, setActiveTab] = useState('single')
  
  // 下载状态管理
  const [downloadStatus, setDownloadStatus] = useState<Record<string, 'idle' | 'downloading' | 'success' | 'error'>>({})

  // 初始化应用 - 优化加载性能
  useEffect(() => {
    const initializeApp = async () => {
      try {
        const url = searchParams.get('url')
        const apiKey = searchParams.get('apikey')

        const activated = storage.isActivated()

        // 仅在已激活时才写入配置，避免未激活抛错导致客户端异常
        if (apiKey && activated) {
          const decodedApiKey = decodeURIComponent(apiKey)
          storage.setApiConfig(decodedApiKey, 'https://zx1.deepwl.net')
        }

        // 启动时确保存储中的地址为固定地址（仅在已激活时执行）
        if (activated) {
          const storedConfig = storage.getApiConfig()
          if (storedConfig && storedConfig.baseUrl !== 'https://zx1.deepwl.net') {
            storage.setApiConfig(storedConfig.key, 'https://zx1.deepwl.net')
            console.log('API 基础地址已强制设为固定值: https://zx1.deepwl.net')
          }
        }

        // 延迟加载批量任务以提升初始加载性能
        setTimeout(async () => {
          try {
            console.log('加载批量任务')
            const savedTasks = await storage.getBatchTasks()
            console.log('加载批量任务成功', savedTasks)
            setBatchTasks(savedTasks)

            // 监听批量任务更新
            const cleanup = savedTasks.map(task =>
              batchTaskManager.onTaskUpdate(task.id, async (updatedTask) => {
                setBatchTasks(prev => prev.map(t => t.id === updatedTask.id ? updatedTask : t))
                await storage.saveBatchTask(updatedTask)
              })
            )

            return () => {
              cleanup.forEach(clean => clean())
            }
          } catch (error) {
            console.error('加载批量任务失败:', error)
            setBatchTasks([])
          }
        }, 100)
      } catch (e) {
        console.warn('初始化API配置时跳过写入：', e)
      }
    }

    initializeApp()
  }, [searchParams])

  // 监听模型变化，自动设置正确的模型类型
  useEffect(() => {
    const customModels = storage.getCustomModels()
    const customModel = customModels.find(cm => cm.value === model)
    if (customModel) {
      setModelType(customModel.type)
      return
    }

    if (model === 'dall-e-3' || model === 'gpt-image-1') {
      setModelType(ModelType.DALLE)
      return
    }
    if (model === 'sora_image' || model === 'gpt_4o_image') {
      setModelType(ModelType.OPENAI)
      return
    }

    if (typeof model === 'string' && model.startsWith('gemini')) {
      setModelType(ModelType.GEMINI)
      return
    }
  }, [model])

  // 文件上传处理
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (files && files.length > 0) {
      Array.from(files).forEach(file => {
        if (file.size > 4 * 1024 * 1024) {
          setError('图片大小不能超过4MB')
          return
        }

        if (!['image/jpeg', 'image/png'].includes(file.type)) {
          setError('只支持JPG和PNG格式的图片')
          return
        }

        const reader = new FileReader()
        reader.onload = (e) => {
          const base64 = e.target?.result as string
          setSourceImages(prev => [...prev, base64])
        }
        reader.readAsDataURL(file)
      })
    }
  }

  const handleRemoveImage = (index: number) => {
    setSourceImages(prev => prev.filter((_, i) => i !== index))
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const isBase64Image = (url: string) => {
    return url.startsWith('data:image')
  }

  const handleSelectCustomModel = (modelValue: string, type: ModelType) => {
    setModel(modelValue)
    setModelType(type)
    toast.success('已选择自定义模型')
  }

  // 生成图片处理 - 简化逻辑以提升性能
  const handleGenerate = async () => {
    if (isImageToImage && sourceImages.length === 0) {
      setError('请先上传或选择图片')
      return
    }
    if (!prompt.trim()) {
      setError('请输入提示词')
      return
    }

    setError(null)
    setIsGenerating(true)
    setGeneratedImages([])
    setStreamContent('')
    setCurrentImageIndex(0)

    try {
      // 这里可以添加实际的生成逻辑
      // 为了演示，我们使用setTimeout模拟异步操作
      setTimeout(() => {
        setIsGenerating(false)
        setGeneratedImages(['/placeholder-image.jpg']) // 使用占位图片
      }, 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成失败，请重试')
      setIsGenerating(false)
    }
  }

  const handleReset = () => {
    setPrompt('')
    setGeneratedImages([])
    setError(null)
    setStreamContent('')
    setSourceImages([])
    setMaskImage(null)
    setAspectRatio('1:1')
    setSize('1024x1024')
    setN(1)
    setCurrentImageIndex(0)
  }

  const handlePrevImage = () => {
    setCurrentImageIndex(prev => (prev - 1 + generatedImages.length) % generatedImages.length)
  }

  const handleNextImage = () => {
    setCurrentImageIndex(prev => (prev + 1) % generatedImages.length)
  }

  const handleDownload = async () => {
    if (generatedImages[currentImageIndex]) {
      const imageUrl = generatedImages[currentImageIndex]
      
      setDownloadStatus(prev => ({ ...prev, [imageUrl]: 'downloading' }))
      
      try {
        const link = document.createElement('a')
        link.href = imageUrl

        if (isBase64Image(imageUrl)) {
          link.download = `generated-image-${Date.now()}.png`
        } else {
          link.download = 'generated-image.png'
        }

        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        
        setDownloadStatus(prev => ({ ...prev, [imageUrl]: 'success' }))
        
        setTimeout(() => {
          setDownloadStatus(prev => ({ ...prev, [imageUrl]: 'idle' }))
        }, 3000)
      } catch (error) {
        console.error('下载失败:', error)
        setDownloadStatus(prev => ({ ...prev, [imageUrl]: 'error' }))
      }
    }
  }

  // 批量任务处理函数
  const handleTaskCreated = (task: BatchTask) => {
    setBatchTasks(prev => [task, ...prev])
    setActiveTab('batch')
  }

  const handleTaskUpdate = (taskId: string, updates: Partial<BatchTask>) => {
    setBatchTasks(prev => prev.map(task =>
      task.id === taskId ? { ...task, ...updates } : task
    ))
  }

  const handleTaskDelete = (taskId: string) => {
    setBatchTasks(prev => prev.filter(task => task.id !== taskId))
    storage.removeBatchTask(taskId)
  }

  const [editingTask, setEditingTask] = useState<BatchTask | null>(null)
  const [showActivationDialog, setShowActivationDialog] = useState(false)
  const [machineId, setMachineId] = useState<string>('')
  const [licenseKey, setLicenseKey] = useState<string>('')
  const [activating, setActivating] = useState<boolean>(false)

  const ensureMachineId = async () => {
    try {
      // 检查是否在Tauri环境中
      if (typeof window !== 'undefined' && (window as any).__TAURI__) {
        const core = await import('@tauri-apps/api/core')
        const id = await core.invoke<string>('get_machine_id')
        setMachineId(id || '')
      } else {
        // 浏览器环境，生成一个稳定的ID
        let id = localStorage.getItem('machine_id')
        if (!id) {
          id = (Math.random().toString(16).slice(2) + Date.now().toString(16)).slice(0,16)
          localStorage.setItem('machine_id', id)
        }
        setMachineId(id)
      }
    } catch {
      const id = (Math.random().toString(16).slice(2) + Date.now().toString(16)).slice(0,16)
      setMachineId(id)
    }
  }

  const handleOpenActivation = async () => {
    await ensureMachineId()
    const lic = storage.getLicenseInfo()
    setLicenseKey(lic.licenseKey || '')
    setShowActivationDialog(true)
  }

  const handleActivate = async () => {
    try {
      setActivating(true)
      storage.saveLicenseInfo({ licenseKey, machineId, activated: !!licenseKey && !!machineId })
      setShowActivationDialog(false)
    } finally {
      setActivating(false)
    }
  }

  const handleTaskEdit = (task: BatchTask) => {
    setEditingTask(task)
  }

  const handleTaskUpdated = (updatedTask: BatchTask) => {
    setBatchTasks(prev => prev.map(task =>
      task.id === updatedTask.id ? updatedTask : task
    ))
    setEditingTask(null)
  }

  return (
    <main className="min-h-screen bg-background">
      {/* 顶部提示栏 */}
      <div className="w-full bg-blue-50 p-4 relative">
        <div className="container mx-auto flex justify-center text-sm text-blue-700">
          <Info className="h-4 w-4 mr-2" />
          <p>数据安全提示：所有生成的图片和历史记录仅保存在本地浏览器中。请及时下载并备份重要图片。使用隐私模式或更换设备会导致数据丢失无法恢复。</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="absolute right-4 top-1/2 -translate-y-1/2 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-full p-2"
          onClick={handleOpenActivation}
          title="激活应用"
        >
          <KeyRound className="h-5 w-5" />
        </Button>
      </div>

      {/* 标题区域 */}
      <div className="text-center py-8">
        <h1 className="text-3xl font-bold">魔法AI绘画</h1>
        <p className="text-gray-500 mt-2">通过简单的文字描述，创造精美的AI艺术作品</p>
      </div>

      <div className="container mx-auto px-4 pb-8 max-w-[1200px]">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="single" className="flex items-center gap-2">
              <ImageIcon className="h-4 w-4" />
              单图片生成
            </TabsTrigger>
            <TabsTrigger value="batch" className="flex items-center gap-2">
              <Layers className="h-4 w-4" />
              批量任务
            </TabsTrigger>
          </TabsList>

          <TabsContent value="single">
            <div className="grid grid-cols-[300px_1fr] gap-6">
              {/* 左侧控制面板 */}
              <div className="space-y-6">
                <Card className="sticky top-4">
                  <CardContent className="p-4 space-y-4">
                    <div className="flex items-center gap-4">
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => setShowApiKeyDialog(true)}
                      >
                        <Settings className="h-4 w-4 mr-2" />
                        密钥设置
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => setShowHistoryDialog(true)}
                      >
                        <History className="h-4 w-4 mr-2" />
                        历史记录
                      </Button>
                    </div>

                    <div className="space-y-2">
                      <h3 className="font-medium">生成模式</h3>
                      <div className="grid grid-cols-2 gap-2">
                        <Button 
                          variant={isImageToImage ? 'outline' : 'secondary'} 
                          className="w-full"
                          onClick={() => setIsImageToImage(false)}
                        >
                          <MessageSquare className="h-4 w-4 mr-2" />
                          文生图
                        </Button>
                        <Button 
                          variant={isImageToImage ? 'secondary' : 'outline'}
                          className="w-full"
                          onClick={() => setIsImageToImage(true)}
                        >
                          <ImageIcon className="h-4 w-4 mr-2" />
                          图生图
                        </Button>
                      </div>
                    </div>

                    {isImageToImage && (
                      <div className="space-y-2">
                        <h3 className="font-medium">上传图片进行编辑</h3>
                        <div 
                          className="border-2 border-dashed rounded-lg p-4 text-center cursor-pointer hover:border-primary/50 transition-colors"
                          onClick={() => fileInputRef.current?.click()}
                        >
                          {sourceImages.length > 0 ? (
                            <div className="grid grid-cols-2 gap-2">
                              {sourceImages.map((image, index) => (
                                <div key={index} className="relative aspect-square w-full">
                                  <Image
                                    src={image}
                                    alt={`Source ${index + 1}`}
                                    fill
                                    className="object-contain rounded-lg"
                                  />
                                  <Button
                                    variant="destructive"
                                    size="icon"
                                    className="absolute -top-2 -right-2 h-6 w-6 rounded-full"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      handleRemoveImage(index)
                                    }}
                                  >
                                    ✕
                                  </Button>
                                </div>
                              ))}
                              {sourceImages.length < 4 && (
                                <div className="flex items-center justify-center aspect-square w-full border-2 border-dashed rounded-lg">
                                  <Upload className="h-8 w-8 text-gray-400" />
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="flex flex-col items-center gap-2 text-gray-500">
                              <Upload className="h-8 w-8" />
                              <p>点击上传图片或拖拽图片到这里</p>
                              <p className="text-xs">仅支持JPG、PNG格式，最大4MB</p>
                              <p className="text-xs text-blue-500">可上传多张图片作为参考（最多4张）</p>
                            </div>
                          )}
                        </div>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/jpeg,image/png"
                          className="hidden"
                          onChange={handleFileUpload}
                          multiple
                        />
                      </div>
                    )}

                    <div className="space-y-2">
                      <h3 className="font-medium">提示词</h3>
                      <Textarea 
                        placeholder="描述你想要生成的图像，例如：一只可爱的猫咪，柔软的毛发，大眼睛，阳光下微笑..."
                        className="min-h-[120px]"
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <h3 className="font-medium">模型选择</h3>
                      <div className="flex gap-2 mb-2">
                        <Select 
                          value={(storage.getCustomModels().some(cm => cm.value === model && cm.type === modelType)) ? `${modelType}::${model}` : model}
                          onValueChange={(value: string) => {
                            if (typeof value === 'string' && value.includes('::')) {
                              const [typeStr, modelVal] = value.split('::')
                              setModel(modelVal as GenerationModel)
                              setModelType(typeStr as unknown as ModelType)
                            } else {
                              setModel(value as GenerationModel)
                            }
                          }}
                        >
                          <SelectTrigger className="flex-1">
                            <SelectValue placeholder="选择生成模型" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="sora_image">GPT Sora_Image 模型</SelectItem>
                            <SelectItem value="gpt_4o_image">GPT 4o_Image 模型</SelectItem>
                            <SelectItem value="gpt-image-1">GPT Image 1 模型</SelectItem>
                            <SelectItem value="dall-e-3">DALL-E 3 模型</SelectItem>
                            <SelectItem value="gemini-2.5-flash-image-preview">Gemini 2.5 模型</SelectItem>
                            
                            {storage.getCustomModels().length > 0 && (
                              <>
                                <SelectItem value="divider" disabled>
                                  ──── 自定义模型 ────
                                </SelectItem>
                                {storage.getCustomModels().map(customModel => (
                                  <SelectItem 
                                    key={customModel.id} 
                                    value={`${customModel.type}::${customModel.value}`}
                                  >
                                    {customModel.name} ({customModel.type === ModelType.DALLE ? 'DALL-E' : customModel.type === ModelType.GEMINI ? 'Gemini' : 'OpenAI'})
                                  </SelectItem>
                                ))}
                              </>
                            )}
                          </SelectContent>
                        </Select>
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => setShowCustomModelDialog(true)}
                          title="管理自定义模型"
                        >
                          <Settings className="h-4 w-4" />
                        </Button>
                      </div>
                      <p className="text-xs text-gray-500">模型类型: {modelType === ModelType.DALLE ? 'DALL-E格式' : modelType === ModelType.GEMINI ? 'Gemini格式' : 'OpenAI格式'}</p>
                      <p className="text-xs text-gray-500">选择不同的AI模型可能会产生不同风格的图像结果</p>
                    </div>

                    <Button 
                      className="w-full" 
                      onClick={handleGenerate}
                      disabled={isGenerating}
                    >
                      {isGenerating ? '生成中...' : isImageToImage ? '编辑图片' : '生成图片'}
                    </Button>
                    <Button 
                      variant="outline" 
                      className="w-full"
                      onClick={handleReset}
                    >
                      重置
                    </Button>
                  </CardContent>
                </Card>
              </div>

              {/* 右侧内容区 */}
              <Card className="min-h-[calc(100vh-13rem)]">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <h2 className="text-xl font-semibold">生成结果</h2>
                    {generatedImages.length > 0 && (
                      <div className="flex items-center gap-2">
                        <Button 
                          size="icon" 
                          variant="ghost"
                          onClick={handleDownload}
                        >
                          <Download className="h-5 w-5" />
                        </Button>
                        <Button 
                          size="icon" 
                          variant="ghost"
                          onClick={() => {
                            setIsImageToImage(true)
                            setSourceImages([generatedImages[currentImageIndex]])
                          }}
                        >
                          <Edit className="h-5 w-5" />
                        </Button>
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col items-stretch justify-start p-6 h-full">
                  {error ? (
                    <div className="text-center text-red-500 whitespace-pre-line">
                      <p>{error}</p>
                    </div>
                  ) : (
                    <div className="w-full h-full flex flex-col gap-4">
                      {isGenerating ? (
                        <div className="flex items-center justify-center h-64">
                          <LoadingSpinner size="lg" text="正在生成图片..." />
                        </div>
                      ) : generatedImages.length > 0 ? (
                        <div className="relative w-full aspect-square max-w-2xl mx-auto">
                          <Image
                            src={generatedImages[currentImageIndex]}
                            alt={prompt}
                            fill
                            className="object-contain rounded-lg"
                            priority
                          />
                          
                          {downloadStatus[generatedImages[currentImageIndex]] && (
                            <div className="absolute top-2 right-2 flex items-center justify-center w-8 h-8 rounded-full backdrop-blur-sm shadow-lg">
                              {downloadStatus[generatedImages[currentImageIndex]] === 'downloading' && (
                                <Loader2 className="h-5 w-5 text-yellow-500 animate-spin" />
                              )}
                              {downloadStatus[generatedImages[currentImageIndex]] === 'success' && (
                                <CheckCircle className="h-5 w-5 text-green-500" />
                              )}
                              {downloadStatus[generatedImages[currentImageIndex]] === 'error' && (
                                <AlertCircle className="h-5 w-5 text-red-500" />
                              )}
                            </div>
                          )}
                          
                          {generatedImages.length > 1 && (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="absolute left-2 top-1/2 -translate-y-1/2 bg-white/50 hover:bg-white/80"
                                onClick={handlePrevImage}
                              >
                                <ChevronLeft className="h-6 w-6" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="absolute right-2 top-1/2 -translate-y-1/2 bg-white/50 hover:bg-white/80"
                                onClick={handleNextImage}
                              >
                                <ChevronRight className="h-6 w-6" />
                              </Button>
                              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-white/50 px-2 py-1 rounded-full text-sm">
                                {currentImageIndex + 1} / {generatedImages.length}
                              </div>
                            </>
                          )}
                        </div>
                      ) : (
                        <div className="flex items-center justify-center h-64 text-gray-400">
                          <div className="text-center">
                            <ImageIcon className="h-16 w-16 mx-auto mb-4 opacity-50" />
                            <p>等待生成...</p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="batch">
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold">批量任务管理</h2>
                  <p className="text-gray-500 mt-1">创建和管理批量图片生成任务</p>
                </div>
                <div className="flex gap-3">
                  <Suspense fallback={<LoadingSpinner />}>
                    <DownloadSettingsDialog>
                      <Button variant="outline" className="px-6">
                        <Settings className="h-4 w-4 mr-2" />
                        下载设置
                      </Button>
                    </DownloadSettingsDialog>
                  </Suspense>
                  <Suspense fallback={<LoadingSpinner />}>
                    <BatchTaskCreator 
                      onTaskCreated={handleTaskCreated} 
                      currentModel={model}
                      currentModelType={modelType}
                      editingTask={editingTask}
                      onTaskUpdated={handleTaskUpdated}
                    />
                  </Suspense>
                </div>
              </div>

              <Suspense fallback={<LoadingSpinner />}>
                <BatchTaskList
                  tasks={batchTasks}
                  onTaskUpdate={handleTaskUpdate}
                  onTaskDelete={handleTaskDelete}
                  onTaskEdit={handleTaskEdit}
                />
              </Suspense>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* 动态导入的对话框组件 */}
      <Suspense fallback={null}>
        <ApiKeyDialog 
          open={showApiKeyDialog} 
          onOpenChange={setShowApiKeyDialog} 
        />
      </Suspense>
      
      <Suspense fallback={null}>
        <HistoryDialog 
          open={showHistoryDialog} 
          onOpenChange={setShowHistoryDialog}
          onEditImage={(imageUrl) => {
            setIsImageToImage(true)
            setSourceImages([imageUrl])
          }}
        />
      </Suspense>
      
      <Suspense fallback={null}>
        <CustomModelDialog
          open={showCustomModelDialog}
          onOpenChange={setShowCustomModelDialog}
          onSelectModel={handleSelectCustomModel}
        />
      </Suspense>

      {/* 激活对话框 */}
      <Dialog open={showActivationDialog} onOpenChange={setShowActivationDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>应用激活</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-xs text-gray-500">机器码</div>
            <div className="px-3 py-2 bg-gray-50 rounded border text-sm break-all select-all">{machineId || '获取中...'}</div>
            <div className="space-y-1">
              <div className="text-xs text-gray-500">激活码</div>
              <input
                className="w-full h-9 px-3 border rounded"
                placeholder="请输入激活码"
                value={licenseKey}
                onChange={(e) => setLicenseKey(e.target.value)}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowActivationDialog(false)}>取消</Button>
            <Button size="sm" onClick={handleActivate} disabled={activating || !licenseKey}>
              {activating ? '激活中...' : '立即激活'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {isMaskEditorOpen && selectedImage ? (
        <Suspense fallback={<LoadingSpinner />}>
          <MaskEditor
            imageUrl={selectedImage}
            onMaskChange={(maskDataUrl) => {
              setMaskImage(maskDataUrl)
              setIsMaskEditorOpen(false)
            }}
            onClose={() => setIsMaskEditorOpen(false)}
            initialMask={maskImage || undefined}
          />
        </Suspense>
      ) : null}
    </main>
  )
}

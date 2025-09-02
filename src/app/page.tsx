"use client"

import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Info, Download, Edit, Settings, History, Image as ImageIcon, MessageSquare, Upload, ChevronLeft, ChevronRight, Maximize2, Github, Globe, Layers } from "lucide-react"
import Image from "next/image"
import { ApiKeyDialog } from "@/components/api-key-dialog"
import { HistoryDialog } from "@/components/history-dialog"
import { BatchTaskList } from "@/components/batch-task-list"
import { BatchTaskCreator } from "@/components/batch-task-creator"
import { DownloadSettingsDialog } from "@/components/download-settings-dialog"
import { useState, useRef, useEffect, Suspense } from "react"
import { api } from "@/lib/api"
import { GenerationModel, AspectRatio, ImageSize, DalleImageData, ModelType, BatchTask } from "@/types"
import { storage } from "@/lib/storage"
import { batchTaskManager } from "@/lib/batch-task-manager"
import { v4 as uuidv4 } from 'uuid'
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { MaskEditor } from "@/components/mask-editor"
import { useSearchParams } from 'next/navigation'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import { CustomModelDialog } from "@/components/custom-model-dialog"
import { toast } from "sonner"

export default function Home() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <HomeContent />
    </Suspense>
  )
}

function HomeContent() {
  const [showApiKeyDialog, setShowApiKeyDialog] = useState(false)
  const [showHistoryDialog, setShowHistoryDialog] = useState(false)
  const [showCustomModelDialog, setShowCustomModelDialog] = useState(false)
  const [prompt, setPrompt] = useState("")
  const [model, setModel] = useState<GenerationModel>("sora_image")
  const [modelType, setModelType] = useState<ModelType>(ModelType.OPENAI)
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatedImages, setGeneratedImages] = useState<string[]>([])
  const [currentImageIndex, setCurrentImageIndex] = useState(0)
  const [showImageDialog, setShowImageDialog] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [streamContent, setStreamContent] = useState<string>("")
  const [isImageToImage, setIsImageToImage] = useState(false)
  const [sourceImages, setSourceImages] = useState<string[]>([])
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("1:1")
  const [size, setSize] = useState<ImageSize>("1024x1024")
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
  const [activeTab, setActiveTab] = useState("single")

  useEffect(() => {
    const url = searchParams.get('url')
    const apiKey = searchParams.get('apikey')

    if (url && apiKey) {
      // 解码 URL 参数
      const decodedUrl = decodeURIComponent(url)
      const decodedApiKey = decodeURIComponent(apiKey)
      storage.setApiConfig(decodedApiKey, decodedUrl)
    }

    // 检查并修复存储的API URL，确保使用HTTPS
    const storedConfig = storage.getApiConfig()
    if (storedConfig && storedConfig.baseUrl && storedConfig.baseUrl.startsWith('http:')) {
      const secureUrl = storedConfig.baseUrl.replace('http:', 'https:')
      storage.setApiConfig(storedConfig.key, secureUrl)
      console.log('API URL已自动升级到HTTPS:', secureUrl)
    }

    // 加载批量任务
    const savedTasks = storage.getBatchTasks()
    setBatchTasks(savedTasks)

    // 监听批量任务更新
    const cleanup = savedTasks.map(task =>
      batchTaskManager.onTaskUpdate(task.id, (updatedTask) => {
        setBatchTasks(prev => prev.map(t => t.id === updatedTask.id ? updatedTask : t))
        storage.saveBatchTask(updatedTask)
      })
    )

    return () => {
      cleanup.forEach(clean => clean())
    }
  }, [searchParams])

  // 监听模型变化，自动设置正确的模型类型（优先使用自定义模型的明确类型）
  useEffect(() => {
    // 1) 自定义模型优先：若匹配到自定义模型，则以其类型为准
    const customModels = storage.getCustomModels()
    const customModel = customModels.find(cm => cm.value === model)
    if (customModel) {
      setModelType(customModel.type)
      return
    }

    // 2) 内置模型
    if (model === 'dall-e-3' || model === 'gpt-image-1') {
      setModelType(ModelType.DALLE)
      return
    }
    if (model === 'sora_image' || model === 'gpt_4o_image') {
      setModelType(ModelType.OPENAI)
      return
    }

    // 3) 启发式（仅当既不是自定义也不是内置时）
    if (typeof model === 'string' && model.startsWith('gemini')) {
      setModelType(ModelType.GEMINI)
      return
    }
  }, [model])

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (files && files.length > 0) {
      Array.from(files).forEach(file => {
        if (file.size > 4 * 1024 * 1024) {
          setError("图片大小不能超过4MB")
          return
        }

        // 检查文件类型
        if (!['image/jpeg', 'image/png'].includes(file.type)) {
          setError("只支持JPG和PNG格式的图片")
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
    // 重置文件输入框的值，确保相同的文件可以再次上传
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const isBase64Image = (url: string) => {
    return url.startsWith('data:image');
  }

  const handleSelectCustomModel = (modelValue: string, type: ModelType) => {
    setModel(modelValue)
    setModelType(type)
    toast.success("已选择自定义模型")
  }

  const handleGenerate = async () => {
    if (isImageToImage && sourceImages.length === 0) {
      setError("请先上传或选择图片")
      return
    }
    if (!prompt.trim()) {
      setError("请输入提示词")
      return
    }

    setError(null)
    setIsGenerating(true)
    setGeneratedImages([])
    setStreamContent("")
    setCurrentImageIndex(0)

    try {
      const isDalleModel = model === 'dall-e-3' || model === 'gpt-image-1' || modelType === ModelType.DALLE
             const isGeminiModel = modelType === ModelType.GEMINI
      
      // 如果有多张源图片，将它们的信息添加到提示词中
      let enhancedPrompt = prompt.trim();
      if (sourceImages.length > 1) {
        enhancedPrompt += `\n\n参考图片信息：上传了${sourceImages.length}张参考图片，第一张作为主要参考，其他图片作为额外参考。`;
      }
      
      const finalPrompt = isDalleModel || isGeminiModel ? enhancedPrompt : `${enhancedPrompt}\n图片生成比例为：${aspectRatio}`
      
      if (isDalleModel) {
        if (isImageToImage) {
          if (sourceImages.length === 0) {
            throw new Error('请先上传图片')
          }
          
          try {
            // DALL-E API仅支持使用第一张图片进行编辑
            // 注意: 对于generateStreamImage方法，我们已添加对多图片的支持
            const response = await api.editDalleImage({
              prompt: finalPrompt,
              model,
              modelType,
              sourceImage: sourceImages[0],
              size,
              n,
              mask: maskImage || undefined,
              quality
            })
            
            const imageUrls = response.data.map(item => {
              // 处理DALL-E返回的URL或base64图片
              const imageUrl = item.url || item.b64_json;
              // 如果是base64格式，添加data:image前缀(如果还没有)
              if (imageUrl && item.b64_json && !isBase64Image(imageUrl)) {
                return `data:image/png;base64,${imageUrl}`;
              }
              return imageUrl || ''; // 添加空字符串作为默认值
            }).filter(url => url !== ''); // 过滤掉空链接
            
            setGeneratedImages(imageUrls)
            
            if (imageUrls.length > 0) {
              storage.addToHistory({
                id: uuidv4(),
                prompt: finalPrompt,
                url: imageUrls[0],
                model,
                createdAt: new Date().toISOString(),
                aspectRatio: '1:1'
              })
            }
          } catch (err) {
            if (err instanceof Error) {
              setError(err.message)
            } else {
              setError('生成图片失败，请重试')
            }
          }
        } else {
          try {
            const response = await api.generateDalleImage({
              prompt: finalPrompt,
              model,
              size,
              n,
              quality
            })
            
            const imageUrls = response.data.map(item => {
              // 处理DALL-E返回的URL或base64图片
              const imageUrl = item.url || item.b64_json;
              // 如果是base64格式，添加data:image前缀(如果还没有)
              if (imageUrl && item.b64_json && !isBase64Image(imageUrl)) {
                return `data:image/png;base64,${imageUrl}`;
              }
              return imageUrl || ''; // 添加空字符串作为默认值
            }).filter(url => url !== ''); // 过滤掉空链接
            
            setGeneratedImages(imageUrls)
            
            if (imageUrls.length > 0) {
              storage.addToHistory({
                id: uuidv4(),
                prompt: finalPrompt,
                url: imageUrls[0],
                model,
                createdAt: new Date().toISOString(),
                aspectRatio: '1:1'
              })
            }
          } catch (err) {
            if (err instanceof Error) {
              setError(err.message)
            } else {
              setError('生成图片失败，请重试')
            }
          }
        }
      } else if (isGeminiModel) {
        if (isImageToImage) {
          if (sourceImages.length === 0) {
            throw new Error('请先上传图片')
          }
          
          try {
            // 使用 Gemini 的图生图接口
            const response = await api.editGeminiImage({
              prompt: finalPrompt,
              model,
              modelType,
              sourceImage: sourceImages[0],
              size,
              n,
              mask: maskImage || undefined,
              quality
            })
            
            const imageUrls = response.data.map(item => {
              // 处理 Gemini 返回的 base64 图片
              const imageUrl = item.url || item.b64_json;
              // 如果是 base64 格式，添加 data:image 前缀(如果还没有)
              if (imageUrl && item.b64_json && !isBase64Image(imageUrl)) {
                return `data:image/png;base64,${imageUrl}`;
              }
              return imageUrl || ''; // 添加空字符串作为默认值
            }).filter(url => url !== ''); // 过滤掉空链接
            
            setGeneratedImages(imageUrls)
            
            if (imageUrls.length > 0) {
              storage.addToHistory({
                id: uuidv4(),
                prompt: finalPrompt,
                url: imageUrls[0],
                model,
                createdAt: new Date().toISOString(),
                aspectRatio: '1:1'
              })
            }
          } catch (err) {
            if (err instanceof Error) {
              setError(err.message)
            } else {
              setError('生成图片失败，请重试')
            }
          }
        } else {
          try {
            // 使用 Gemini 的文生图接口
            const response = await api.generateGeminiImage({
              prompt: finalPrompt,
              model,
              size,
              n,
              quality
            })
            
            const imageUrls = response.data.map(item => {
              // 处理 Gemini 返回的 base64 图片
              const imageUrl = item.url || item.b64_json;
              // 如果是 base64 格式，添加 data:image 前缀(如果还没有)
              if (imageUrl && item.b64_json && !isBase64Image(imageUrl)) {
                return `data:image/png;base64,${imageUrl}`;
              }
              return imageUrl || ''; // 添加空字符串作为默认值
            }).filter(url => url !== ''); // 过滤掉空链接
            
            setGeneratedImages(imageUrls)
            
            if (imageUrls.length > 0) {
              storage.addToHistory({
                id: uuidv4(),
                prompt: finalPrompt,
                url: imageUrls[0],
                model,
                createdAt: new Date().toISOString(),
                aspectRatio: '1:1'
              })
            }
          } catch (err) {
            if (err instanceof Error) {
              setError(err.message)
            } else {
              setError('生成图片失败，请重试')
            }
          }
        }
      } else {
        await api.generateStreamImage(
          {
            prompt: finalPrompt,
            model,
            modelType,
            sourceImage: isImageToImage && sourceImages.length > 0 ? sourceImages[0] : undefined,
            sourceImages: isImageToImage ? sourceImages : undefined,
            isImageToImage,
            aspectRatio
          },
          {
            onMessage: (content) => {
              setStreamContent(prev => prev + content)
              if (contentRef.current) {
                contentRef.current.scrollTop = contentRef.current.scrollHeight
              }
            },
            onComplete: (imageUrl) => {
              setGeneratedImages([imageUrl])
              storage.addToHistory({
                id: uuidv4(),
                prompt: finalPrompt,
                url: imageUrl,
                model,
                createdAt: new Date().toISOString(),
                aspectRatio
              })
            },
            onError: (error) => {
              // 处理流式 API 错误
              if (typeof error === 'object' && error !== null) {
                const apiError = error as any
                setError(`图片生成失败: ${apiError.message || '未知错误'}\n${apiError.code ? `错误代码: ${apiError.code}` : ''}`)
              } else {
                setError(error.toString())
              }
            }
          }
        )
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "生成失败，请重试")
    } finally {
      setIsGenerating(false)
    }
  }

  const handleReset = () => {
    setPrompt("")
    setGeneratedImages([])
    setError(null)
    setStreamContent("")
    setSourceImages([])
    setMaskImage(null)
    setAspectRatio("1:1")
    setSize("1024x1024")
    setN(1)
    setCurrentImageIndex(0)
  }

  const handlePrevImage = () => {
    setCurrentImageIndex(prev => (prev - 1 + generatedImages.length) % generatedImages.length)
  }

  const handleNextImage = () => {
    setCurrentImageIndex(prev => (prev + 1) % generatedImages.length)
  }

  const handleEditCurrentImage = () => {
    if (generatedImages[currentImageIndex]) {
      setIsImageToImage(true)
      setSourceImages([generatedImages[currentImageIndex]])
    }
  }

  const handleDownload = () => {
    if (generatedImages[currentImageIndex]) {
      const imageUrl = generatedImages[currentImageIndex];
      const link = document.createElement('a');
      link.href = imageUrl;

      // 为base64图片设置合适的文件名
      if (isBase64Image(imageUrl)) {
        link.download = `generated-image-${Date.now()}.png`;
      } else {
        link.download = 'generated-image.png';
      }

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  // 批量任务处理函数
  const handleTaskCreated = (task: BatchTask) => {
    setBatchTasks(prev => [task, ...prev])
    setActiveTab("batch")
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
          onClick={() => window.open('https://github.com/HappyDongD/magic_image', '_blank')}
        >
          <Github className="h-5 w-5" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="absolute right-14 top-1/2 -translate-y-1/2 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-full p-2"
          onClick={() => window.open('https://mj.do', '_blank')}
          title="访问 mj.do"
        >
          <Globe className="h-5 w-5" />
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
                      variant={isImageToImage ? "outline" : "secondary"} 
                      className="w-full"
                      onClick={() => setIsImageToImage(false)}
                    >
                      <MessageSquare className="h-4 w-4 mr-2" />
                      文生图
                    </Button>
                    <Button 
                      variant={isImageToImage ? "secondary" : "outline"}
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
                                  e.stopPropagation();
                                  handleRemoveImage(index);
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

                {isImageToImage && sourceImages.length > 0 && (model === 'dall-e-3' || model === 'gpt-image-1' || modelType === ModelType.DALLE || model === 'gemini-2.5-flash-image-preview' || modelType === ModelType.GEMINI) && (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      setIsMaskEditorOpen(true)
                      setSelectedImage(sourceImages[0])
                    }}
                  >
                    {maskImage ? "重新编辑区域" : "编辑图片区域"}
                  </Button>
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
                        
                        {/* 显示自定义模型 */}
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
                                {customModel.name} ({customModel.type === ModelType.DALLE ? "DALL-E" : customModel.type === ModelType.GEMINI ? "Gemini" : "OpenAI"})
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

                {(model === 'dall-e-3' || model === 'gpt-image-1' || modelType === ModelType.DALLE || model === 'gemini-2.5-flash-image-preview' || modelType === ModelType.GEMINI) && (
                  <>
                    <div className="space-y-2">
                      <h3 className="font-medium">图片尺寸</h3>
                      <Select value={size} onValueChange={(value: ImageSize) => setSize(value)}>
                        <SelectTrigger>
                          <SelectValue placeholder="选择图片尺寸" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1024x1024">1024x1024 方形</SelectItem>
                          <SelectItem value="1536x1024">1536x1024 横向</SelectItem>
                          <SelectItem value="1024x1536">1024x1536 纵向</SelectItem>
                          <SelectItem value="1792x1024">1792x1024 宽屏</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <h3 className="font-medium">生成数量</h3>
                      <Select value={n.toString()} onValueChange={(value) => setN(parseInt(value))}>
                        <SelectTrigger>
                          <SelectValue placeholder="选择生成数量" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">1张</SelectItem>
                          <SelectItem value="2">2张</SelectItem>
                          <SelectItem value="3">3张</SelectItem>
                          <SelectItem value="4">4张</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {isImageToImage && (
                      <div className="space-y-2">
                        <h3 className="font-medium">图片质量</h3>
                        <Select 
                          value={quality} 
                          onValueChange={(value: 'auto' | 'high' | 'medium' | 'low' | 'hd' | 'standard') => setQuality(value)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="选择图片质量" />
                          </SelectTrigger>
                          <SelectContent>
                            {model === 'dall-e-3' ? (
                              <>
                                <SelectItem value="hd">HD 高质量</SelectItem>
                                <SelectItem value="standard">标准质量</SelectItem>
                                <SelectItem value="auto">自动选择</SelectItem>
                              </>
                            ) : model === 'gpt-image-1' ? (
                              <>
                                <SelectItem value="high">高质量</SelectItem>
                                <SelectItem value="medium">中等质量</SelectItem>
                                <SelectItem value="low">低质量</SelectItem>
                                <SelectItem value="auto">自动选择</SelectItem>
                              </>
                            ) : null}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </>
                )}

                {!(model === 'dall-e-3' || model === 'gpt-image-1' || modelType === ModelType.DALLE) && (
                  <div className="space-y-2">
                    <h3 className="font-medium">图片比例</h3>
                    <Select value={aspectRatio} onValueChange={(value: AspectRatio) => setAspectRatio(value)}>
                      <SelectTrigger>
                        <SelectValue placeholder="选择图片比例" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1:1">1:1 方形</SelectItem>
                        <SelectItem value="16:9">16:9 宽屏</SelectItem>
                        <SelectItem value="9:16">9:16 竖屏</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <Button 
                  className="w-full" 
                  onClick={handleGenerate}
                  disabled={isGenerating}
                >
                  {isGenerating ? "生成中..." : isImageToImage ? "编辑图片" : "生成图片"}
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
                  {(model === 'dall-e-3' || model === 'gpt-image-1' || modelType === ModelType.DALLE) ? (
                    <div className="text-center text-gray-400">
                      {isGenerating ? "正在生成中..." : generatedImages.length === 0 ? "等待生成..." : null}
                    </div>
                  ) : (
                    <div 
                      ref={contentRef}
                      className="flex-1 overflow-y-auto rounded-lg bg-gray-50 p-4 font-mono text-sm min-h-[200px] markdown-content"
                    >
                      {streamContent ? (
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          rehypePlugins={[rehypeHighlight]}
                          components={{
                            // 自定义链接在新窗口打开
                            a: ({ node, ...props }) => (
                              <a target="_blank" rel="noopener noreferrer" {...props} />
                            ),
                            // 自定义代码块样式
                            code: ({ node, className, children, ...props }: any) => {
                              const match = /language-(\w+)/.exec(className || '')
                              // 内联代码与代码块处理
                              const isInline = !match && !className
                              if (isInline) {
                                return <code className={className} {...props}>{children}</code>
                              }
                              // 代码块
                              return (
                                <pre className={`${className || ''}`}>
                                  <code className={match ? `language-${match[1]}` : ''} {...props}>
                                    {children}
                                  </code>
                                </pre>
                              )
                            }
                          }}
                        >
                          {streamContent}
                        </ReactMarkdown>
                      ) : (
                        <div className="text-gray-400 text-center">
                          {isGenerating ? "正在生成中..." : "等待生成..."}
                        </div>
                      )}
                    </div>
                  )}
                  {generatedImages.length > 0 && (
                    <div className="relative w-full aspect-square max-w-2xl mx-auto">
                      <Image
                        src={generatedImages[currentImageIndex]}
                        alt={prompt}
                        fill
                        className="object-contain rounded-lg"
                      />
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
                  <DownloadSettingsDialog>
                    <Button variant="outline" className="px-6">
                      <Settings className="h-4 w-4 mr-2" />
                      下载设置
                    </Button>
                  </DownloadSettingsDialog>
                  <BatchTaskCreator 
                    onTaskCreated={handleTaskCreated} 
                    currentModel={model}
                    currentModelType={modelType}
                    editingTask={editingTask}
                    onTaskUpdated={handleTaskUpdated}
                  />
                </div>
              </div>

              <BatchTaskList
                tasks={batchTasks}
                onTaskUpdate={handleTaskUpdate}
                onTaskDelete={handleTaskDelete}
                onTaskEdit={handleTaskEdit}
              />
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <ApiKeyDialog 
        open={showApiKeyDialog} 
        onOpenChange={setShowApiKeyDialog} 
      />
      <HistoryDialog 
        open={showHistoryDialog} 
        onOpenChange={setShowHistoryDialog}
        onEditImage={(imageUrl) => {
          setIsImageToImage(true)
          setSourceImages([imageUrl])
        }}
      />
      <CustomModelDialog
        open={showCustomModelDialog}
        onOpenChange={setShowCustomModelDialog}
        onSelectModel={handleSelectCustomModel}
      />

      <footer className="w-full py-4 text-center text-sm text-gray-500">
        <a 
          href="https://github.com/HappyDongD/magic_image" 
          target="_blank" 
          rel="noopener noreferrer"
          className="hover:text-primary transition-colors inline-flex items-center gap-2"
        >
          <Github className="h-4 w-4" />
          访问 GitHub 项目主页
        </a>
      </footer>

      <Dialog open={showImageDialog} onOpenChange={setShowImageDialog}>
        <DialogContent className="max-w-4xl">
          <div className="relative w-full aspect-square">
            <Image
              src={generatedImages[currentImageIndex]}
              alt={prompt}
              fill
              className="object-contain rounded-lg"
            />
          </div>
        </DialogContent>
      </Dialog>

      {isMaskEditorOpen && selectedImage ? (
        <MaskEditor
          imageUrl={selectedImage}
          onMaskChange={(maskDataUrl) => {
            setMaskImage(maskDataUrl)
            setIsMaskEditorOpen(false)
          }}
          onClose={() => setIsMaskEditorOpen(false)}
          initialMask={maskImage || undefined}
        />
      ) : null}
    </main>
  )
}

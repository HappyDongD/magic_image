"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Settings, History, Image as ImageIcon, MessageSquare, Upload, ChevronRight, ArrowUp, Info, ChevronDown, Wand2, X, AlertTriangle, Edit, ChevronLeft } from "lucide-react"
import Image from "next/image"
import { ApiKeyDialog } from "@/components/api-key-dialog"
import { HistoryDialog } from "@/components/history-dialog"
import { useState, useRef, useEffect, Suspense, useCallback } from "react"
import { api } from "@/lib/api"
import { GenerationModel, AspectRatio, ImageSize, ModelType, CustomModel } from "@/types"
import { storage } from "@/lib/storage"
import { v4 as uuidv4 } from 'uuid'
import confetti from 'canvas-confetti'
import { downloadImageToBase64 } from "@/lib/utils"
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { MaskEditor } from "@/components/mask-editor"
import { useSearchParams } from 'next/navigation'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import { CustomModelDialog } from "@/components/custom-model-dialog"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

interface GenerationResult {
  id: string
  status: 'loading' | 'success' | 'failed'
  url?: string
  model: string
  duration?: string
  error?: string
  aspectRatio: string
}

export default function Home() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <HomeContent />
    </Suspense>
  )
}


function LoadingTimer() {
    const [seconds, setSeconds] = useState(0)
    
    useEffect(() => {
        const timer = setInterval(() => {
            setSeconds(s => s + 0.1)
        }, 100)
        return () => clearInterval(timer)
    }, [])

    return (
        <p className="text-white/80 text-sm text-center font-mono">
           AI 正在挥洒创意 {seconds.toFixed(1)}s
        </p>
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
  const [generatedImages, setGeneratedImages] = useState<GenerationResult[]>([])
  const [currentImageIndex, setCurrentImageIndex] = useState(0)
  const [showImageDialog, setShowImageDialog] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [streamContent, setStreamContent] = useState<string>("")
  const [isImageToImage, setIsImageToImage] = useState(false)
  const [sourceImages, setSourceImages] = useState<string[]>([])
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("1:1")
  const [customAspectRatio, setCustomAspectRatio] = useState("")
  const [size, setSize] = useState<ImageSize>("1024x1024")
  const [n, setN] = useState(1)
  const [quality, setQuality] = useState<'auto' | 'high' | 'medium' | 'low' | 'hd' | 'standard' | '1K' | '2K' | '4K'>('auto')
  const [customModels, setCustomModels] = useState<CustomModel[]>([])
  const [page, setPage] = useState(1)
  const pageSize = 20
  const contentRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [maskImage, setMaskImage] = useState<string | null>(null)
  const [isMaskEditorOpen, setIsMaskEditorOpen] = useState(false)
  const [selectedImage, setSelectedImage] = useState<string | null>(null)
  const searchParams = useSearchParams()

  const loadCustomModels = useCallback(async () => {
    const models = await storage.getCustomModels()
    setCustomModels(models)
  }, [])

  useEffect(() => {
    let active = true

    const syncConfig = async () => {
      const url = searchParams.get('url')
      const apiKey = searchParams.get('apikey')
      
      if (url && apiKey) {
        const decodedUrl = decodeURIComponent(url)
        const decodedApiKey = decodeURIComponent(apiKey)
        await storage.setApiConfig(decodedApiKey, decodedUrl)
      }

      const savedConfig = await storage.getApiConfig()
      if (!active) return

      if (savedConfig && savedConfig.baseUrl && savedConfig.baseUrl.startsWith('http:')) {
        const secureUrl = savedConfig.baseUrl.replace('http:', 'https:')
        await storage.setApiConfig(savedConfig.key, secureUrl)
        if (active) {
          console.log('API URL upgraded to HTTPS:', secureUrl)
        }
      }
    }

    syncConfig()

    return () => {
      active = false
    }
  }, [searchParams])

  useEffect(() => {
    loadCustomModels()
  }, [loadCustomModels])

  // 加载历史记录
  useEffect(() => {
    const loadHistory = async () => {
      const history = await storage.getHistory()
      if (history && history.length > 0) {
         setGeneratedImages(history.map(item => ({
            id: item.id,
            status: 'success',
            url: item.url,
            model: item.model,
            aspectRatio: item.aspectRatio || '1:1',
         })))
      }
    }
    loadHistory()
  }, [])

  useEffect(() => {
    if (!showCustomModelDialog) {
      loadCustomModels()
    }
  }, [showCustomModelDialog, loadCustomModels])

  useEffect(() => {
    const customModel = customModels.find(cm => cm.value === model)
    if (customModel) {
      setModelType(customModel.type)
      return
    }

    if (model === 'dall-e-3' || model === 'gpt-image-1') {
      setModelType(ModelType.DALLE)
      return
    }
    if (model === 'sora_image') {
      setModelType(ModelType.OPENAI)
      return
    }

    if (typeof model === 'string' && model.startsWith('gemini')) {
      setModelType(ModelType.GEMINI)
      return
    }
  }, [model, customModels])

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
          if (!isImageToImage) setIsImageToImage(true)
        }
        reader.readAsDataURL(file)
      })
    }
  }

  const handleRemoveImage = (index: number) => {
    setSourceImages(prev => {
      const newImages = prev.filter((_, i) => i !== index)
      if (newImages.length === 0) setIsImageToImage(false)
      return newImages
    })
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
    setStreamContent("")
    setCurrentImageIndex(0)

    const startTime = Date.now()

    // Create placeholder loading states based on 'n' (concurrency)
    const placeholders: GenerationResult[] = Array(n).fill(null).map(() => ({
      id: uuidv4(),
      status: 'loading',
      model: model,
      aspectRatio: aspectRatio,
    }))
    
    // Replace current results with loading placeholders
    setGeneratedImages(prev => [...placeholders, ...prev])
    setPage(1)

    try {
      const isDalleModel = model === 'dall-e-3' || model === 'gpt-image-1' || modelType === ModelType.DALLE
      const isGeminiModel = modelType === ModelType.GEMINI

      // 如果有多张源图片，将它们的信息添加到提示词中
      let enhancedPrompt = prompt.trim();
      if (sourceImages.length > 1) {
        enhancedPrompt += `\n\n参考图片信息：上传了${sourceImages.length}张参考图片，第一张作为主要参考，其他图片作为额外参考。`;
      }

      // 处理 Gemini 的自定义宽高比
      let finalAspectRatio = aspectRatio
      if (isGeminiModel && aspectRatio === 'custom' as any) {
        finalAspectRatio = customAspectRatio
      }

      // Determine DALL-E Size from Aspect Ratio
      let dalleSize: ImageSize = '1024x1024';
      if (isDalleModel) {
          if (aspectRatio === '16:9') dalleSize = '1536x1024';
          else if (aspectRatio === '9:16') dalleSize = '1024x1536';
      }

      const finalPrompt = isDalleModel || isGeminiModel ? enhancedPrompt : `${enhancedPrompt}\n图片生成比例为：${finalAspectRatio}`

      // Function to handle single generation task
      const generateSingleTask = async (placeholderId: string) => {
         const taskStartTime = Date.now();
         try {
            let rawImageUrls: string[] = [];

            if (isDalleModel) {
                let response;
                if (isImageToImage) {
                    if (sourceImages.length === 0) throw new Error('请先上传图片')
                    response = await api.editDalleImage({
                      prompt: finalPrompt,
                      model,
                      modelType,
                      sourceImage: sourceImages[0],
                      size: dalleSize,
                      n: 1, // Force n=1 per concurrent request
                      mask: maskImage || undefined,
                      quality
                    })
                } else {
                    response = await api.generateDalleImage({
                      prompt: finalPrompt,
                      model,
                      size: dalleSize,
                      n: 1, // Force n=1 per concurrent request
                      quality
                    })
                }
                
                rawImageUrls = response.data.map(item => {
                  const imageUrl = item.url || item.b64_json;
                  if (imageUrl && item.b64_json && !isBase64Image(imageUrl)) {
                    return `data:image/png;base64,${imageUrl}`;
                  }
                  return imageUrl || '';
                }).filter(url => url !== '');

            } else if (isGeminiModel) {
                let response;
                if (isImageToImage) {
                  if (sourceImages.length === 0) throw new Error('请先上传图片')
                  response = await api.editGeminiImage({
                    prompt: finalPrompt,
                    model,
                    modelType,
                    sourceImage: sourceImages[0],
                    mask: maskImage || undefined,
                    quality,
                    aspectRatio: finalAspectRatio
                  })
                } else {
                  response = await api.generateGeminiImage({
                    prompt: finalPrompt,
                    model,
                    quality,
                    aspectRatio: finalAspectRatio
                  })
                }

                rawImageUrls = response.data.map(item => {
                  const imageUrl = item.url || item.b64_json;
                  if (imageUrl && item.b64_json && !isBase64Image(imageUrl)) {
                    return `data:image/png;base64,${imageUrl}`;
                  }
                  return imageUrl || '';
                }).filter(url => url !== '');
                
            } else {
                // Stream based models
                await new Promise<void>((resolve, reject) => {
                    api.generateStreamImage(
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
                        },
                        onComplete: (imageUrl) => {
                           rawImageUrls = [imageUrl];
                           resolve();
                        },
                        onError: (error) => {
                          let msg = error.toString()
                          if (typeof error === 'object' && error !== null) {
                            const apiError = error as any
                            msg = `图片生成失败: ${apiError.message || '未知错误'}\n${apiError.code ? `错误代码: ${apiError.code}` : ''}`
                          }
                          reject(new Error(msg));
                        }
                      }
                    )
                });
            }

            // Process Success
            const duration = ((Date.now() - taskStartTime) / 1000).toFixed(2) + 's'
            const imageUrls = await Promise.all(rawImageUrls.map(async (url) => {
                try {
                   return await downloadImageToBase64(url);
                } catch (e) {
                   // Silently fallback to original URL if CORS/Network fails
                   return url;
                }
            }));
            
            if (imageUrls.length > 0) {
                 const result: GenerationResult = {
                    id: placeholderId,
                    status: 'success',
                    url: imageUrls[0], // Take the first one for this task
                    model,
                    duration,
                    aspectRatio: finalAspectRatio
                 }

                 setGeneratedImages(prev => prev.map(img => img.id === placeholderId ? result : img));
                 
                 storage.addToHistory({
                    id: result.id,
                    prompt: finalPrompt,
                    url: imageUrls[0],
                    model,
                    createdAt: new Date().toISOString(),
                    aspectRatio: '1:1'
                  })
                  
                  if (placeholders[0].id === placeholderId) {
                      confetti({ particleCount: 50, spread: 50, origin: { y: 0.6 } });
                  }
            }

         } catch (err) {
            const duration = ((Date.now() - taskStartTime) / 1000).toFixed(2) + 's'
            const errorMessage = err instanceof Error ? err.message : "生成失败";
            
            setGeneratedImages(prev => prev.map(img =>
                img.id === placeholderId ? { ...img, status: 'failed', error: errorMessage, duration } : img
            ))
         }
      }

      // Run all tasks concurrently
      await Promise.all(placeholders.map(p => generateSingleTask(p.id)));
      toast.success("生成任务已完成");

    } catch (err) {
      // Top level error (e.g. validation)
      setError(err instanceof Error ? err.message : "生成失败，请重试")
    } finally {
      setIsGenerating(false)
    }
  }

  const modelOptions = [
    { value: "sora_image", label: "Sora Image", type: ModelType.OPENAI },
    { value: "gemini-3-pro-image-preview", label: "Banana Pro", type: ModelType.GEMINI },
    { value: "gemini-2.5-flash-image-preview", label: "Banana 2.5", type: ModelType.GEMINI },
    { value: "dall-e-3", label: "DALL-E 3", type: ModelType.DALLE },
  ]

  const quickModels = [
    { name: '免费模型', value: 'sora_image', type: ModelType.OPENAI },
    { name: 'Nano-Banana-2.0', value: 'gemini-2.5-flash-image-preview', type: ModelType.GEMINI },
    { name: 'GPT-4O-image', value: 'dall-e-3', type: ModelType.DALLE },
    { name: 'Midjourney', value: 'midjourney', type: ModelType.MJ }, 
  ]
  
  // 处理点击标签切换模型
  const handleQuickModelClick = (item: any) => {
      // 检查是否是 Midjourney (占位处理，目前逻辑中没有直接对应 MJ 的处理分支，暂归为自定义或 OpenAI 类处理逻辑，或者仅作为示例)
      if(item.value === 'midjourney') {
         toast.info("Midjourney 暂未集成，敬请期待")
         return
      }
      setModel(item.value)
      setModelType(item.type)
  }

  return (
    <main className="min-h-screen bg-[#fafafa] bg-dot-pattern">
      {/* 顶部导航 */}
      <header className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-auto min-h-16 py-2 items-center justify-between px-4 max-w-7xl mx-auto">
          <div className="flex items-center gap-2 font-bold text-xl">
            <img src="https://unpkg.com/@lobehub/fluent-emoji-anim-2@latest/assets/1f618.webp" alt="Magic Image" className="w-10 h-10" />
            <span>Magic Image</span>
          </div>

          <div className="flex items-center gap-4">
             <Button variant="default" size="sm" className="bg-black text-white hover:bg-black/90 rounded-full px-4" onClick={() => setShowApiKeyDialog(true)}>
                配置生图密钥 <ChevronRight className="w-4 h-4 ml-1" />
             </Button>

          </div>
        </div>
      </header>

      {/* Hero 区域 */}
      <section className="container max-w-4xl mx-auto pt-8 pb-8 px-4">
        {/* 主要操作区 */}
        <div className="w-full">
             <div className="text-center mb-8">
                 <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-orange-50 text-orange-600 text-xs font-medium mb-6 border border-orange-100">
                    <span className="text-yellow-500">✨</span>
                    公告：最新上线香蕉 2.0 系列：Nano-Banana-2.0、Nano-Banana-Pro AI 画图模型，支持4K生图，欢迎体验！
                 </div>
                 
                 <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-orange-500 mb-6 tracking-tight">
                    用简单的文字，让 AI 画出你的创意图像
                 </h1>

                 <div className="flex flex-wrap items-center justify-center gap-3 mb-8">
                    {quickModels.map((item, index) => (
                        <div
                           key={index}
                           className={cn(
                               "px-4 py-1.5 rounded-full text-sm border bg-white text-gray-600 border-gray-200 cursor-default flex items-center gap-2",
                               index === 0 && "text-green-600 border-green-200 bg-green-50",
                               index === 2 && "text-blue-600 border-blue-200 bg-blue-50",
                               index === 3 && "text-purple-600 border-purple-200 bg-purple-50"
                           )}
                        >
                           {/* Add icons to quick models */}
                           {(item.value === 'sora_image' || item.value === 'dall-e-3') && <img src="icon/openai.svg" className="w-4 h-4" alt="OpenAI" />}
                           {item.value.includes('gemini') && <img src="icon/gemini-color.svg" className="w-4 h-4" alt="Gemini" />}
                           {item.value === 'midjourney' && <img src="icon/midjourney.svg" className="w-4 h-4" alt="Midjourney" />}
                           {item.name}
                        </div>
                    ))}
                 </div>
             </div>

             {/* 图片上传预览区域 - 移到输入框上方 */}
             <div className="max-w-3xl mx-auto mb-4 flex gap-3 px-2">
                 {sourceImages.length > 0 && sourceImages.map((img, idx) => (
                    <div key={idx} className="relative w-20 h-20 rounded-xl overflow-hidden border-2 border-white shadow-md group">
                       <Image src={img} alt="preview" fill className="object-cover" />
                       <button
                          onClick={() => handleRemoveImage(idx)}
                          className="absolute top-1 right-1 bg-black/50 hover:bg-black/70 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-all backdrop-blur-sm"
                       >
                          <X className="w-3 h-3" />
                       </button>
                    </div>
                 ))}
             </div>

             {/* 输入框区域 */}
             <div className="max-w-3xl mx-auto relative bg-white rounded-3xl shadow-xl shadow-gray-100/50 border border-gray-100 p-2">
                <div className="relative">
                    <Textarea
                      placeholder="输入你的生图提示词..."
                      className="min-h-[120px] w-full resize-none border-0 bg-transparent p-5 text-base focus-visible:ring-0 placeholder:text-gray-300"
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                    />
                </div>

                {/* 工具栏 */}
                <div className="flex flex-wrap items-center justify-between gap-3 px-4 pb-3 mt-2 border-t border-gray-50 pt-3">
                   <div className="flex flex-wrap items-center gap-2">
                      <DropdownMenu>
                         <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-9 px-3 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-lg gap-2">
                               {(() => {
                                   const currentModel = modelOptions.find(m => m.value === model) || customModels.find(m => m.value === model);
                                   if (currentModel?.value === 'sora_image' || currentModel?.value === 'dall-e-3') return <img src="icon/openai.svg" className="w-4 h-4" alt="OpenAI" />;
                                   if (currentModel?.value?.includes('gemini')) return <img src="icon/gemini-color.svg" className="w-4 h-4" alt="Gemini" />;
                                   if (currentModel?.value === 'midjourney') return <img src="icon/midjourney.svg" className="w-4 h-4" alt="Midjourney" />;
                                   return <Settings className="w-4 h-4" />;
                               })()}
                               <span className="truncate max-w-[100px] sm:max-w-none">
                                   {modelOptions.find(m => m.value === model)?.label || customModels.find(m => m.value === model)?.name || "模型选择"}
                               </span>
                               <ChevronDown className="w-3 h-3 opacity-50 shrink-0" />
                            </Button>
                         </DropdownMenuTrigger>
                         <DropdownMenuContent align="start" className="w-[200px]">
                            {modelOptions.map((opt) => (
                               <DropdownMenuItem key={opt.value} onClick={() => {
                                  setModel(opt.value as GenerationModel)
                                  setModelType(opt.type)
                               }} className="gap-2">
                                  {(opt.value === 'sora_image' || opt.value === 'dall-e-3') && <img src="icon/openai.svg" className="w-4 h-4" alt="OpenAI" />}
                                  {opt.value.includes('gemini') && <img src="icon/gemini-color.svg" className="w-4 h-4" alt="Gemini" />}
                                  {opt.label}
                               </DropdownMenuItem>
                            ))}
                            {customModels.length > 0 && (
                               <>
                                  <div className="h-px bg-border my-1" />
                                  <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">自定义模型</div>
                                  {customModels.map(cm => (
                                     <DropdownMenuItem key={cm.id} onClick={() => {
                                        setModel(cm.value as GenerationModel)
                                        setModelType(cm.type)
                                     }} className="gap-2">
                                        <Settings className="w-4 h-4" />
                                        {cm.name}
                                     </DropdownMenuItem>
                                  ))}
                               </>
                            )}
                            <div className="h-px bg-border my-1" />
                             <DropdownMenuItem onClick={() => setShowCustomModelDialog(true)}>
                               <Settings className="w-4 h-4 mr-2" />
                               管理自定义模型
                             </DropdownMenuItem>
                         </DropdownMenuContent>
                      </DropdownMenu>

                      {/* 比例选择 - 全模型支持 */}
                      <DropdownMenu>
                         <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-9 px-3 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-lg gap-2">
                               <div className="w-4 h-4 border-2 border-current rounded-sm" />
                               {aspectRatio === 'custom' ? (customAspectRatio || '自定义') : aspectRatio}
                               <ChevronDown className="w-3 h-3 opacity-50" />
                            </Button>
                         </DropdownMenuTrigger>
                         <DropdownMenuContent align="start">
                            <DropdownMenuItem onClick={() => setAspectRatio("1:1")}>1:1 方形</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setAspectRatio("16:9")}>16:9 宽屏</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setAspectRatio("9:16")}>9:16 竖屏</DropdownMenuItem>
                            {(modelType === ModelType.GEMINI) && (
                               <DropdownMenuItem onClick={() => setAspectRatio("custom")}>自定义</DropdownMenuItem>
                            )}
                         </DropdownMenuContent>
                      </DropdownMenu>

                      {/* 清晰度/质量选择 - Gemini & DALL-E */}
                      {(modelType === ModelType.GEMINI || modelType === ModelType.DALLE || model === 'dall-e-3') && (
                          <DropdownMenu>
                             <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-9 px-3 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-lg gap-2">
                                   {quality === 'auto' ? '自动画质' : quality === 'hd' ? 'HD画质' : quality === 'standard' ? '标准画质' : quality}
                                   <ChevronDown className="w-3 h-3 opacity-50" />
                                </Button>
                             </DropdownMenuTrigger>
                             <DropdownMenuContent align="start">
                                {modelType === ModelType.GEMINI ? (
                                    <>
                                       <DropdownMenuItem onClick={() => setQuality("1K")}>1K 画质</DropdownMenuItem>
                                       <DropdownMenuItem onClick={() => setQuality("2K")}>2K 画质</DropdownMenuItem>
                                       <DropdownMenuItem onClick={() => setQuality("4K")}>4K 画质</DropdownMenuItem>
                                    </>
                                ) : (
                                    <>
                                       <DropdownMenuItem onClick={() => setQuality("auto")}>自动画质</DropdownMenuItem>
                                       <DropdownMenuItem onClick={() => setQuality("hd")}>HD 高清</DropdownMenuItem>
                                       <DropdownMenuItem onClick={() => setQuality("standard")}>标准画质</DropdownMenuItem>
                                    </>
                                )}
                             </DropdownMenuContent>
                          </DropdownMenu>
                      )}

                      {/* 生成数量 - 全模型支持 */}
                      <DropdownMenu>
                         <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-9 px-3 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-lg gap-2">
                               生成{n}张
                               <ChevronDown className="w-3 h-3 opacity-50" />
                            </Button>
                         </DropdownMenuTrigger>
                         <DropdownMenuContent align="start">
                            {[1, 2, 3, 4].map(num => (
                               <DropdownMenuItem key={num} onClick={() => setN(num)}>{num} 张</DropdownMenuItem>
                            ))}
                         </DropdownMenuContent>
                      </DropdownMenu>
                      
                      {/* 图片上传按钮 */}
                      <Button
                         variant="ghost"
                         size="sm"
                         className="h-9 w-9 p-0 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-lg"
                         onClick={() => fileInputRef.current?.click()}
                         title="上传参考图"
                      >
                          <ImageIcon className="w-4 h-4" />
                      </Button>
                      <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/jpeg,image/png"
                          className="hidden"
                          onChange={handleFileUpload}
                          multiple
                      />

                      {/* 自定义比例输入框 */}
                      {aspectRatio === 'custom' && (
                         <input
                            type="text"
                            placeholder="例如 21:9"
                            className="h-9 w-24 px-2 text-sm bg-gray-50 border-none rounded-lg focus:ring-1 focus:ring-orange-500"
                            value={customAspectRatio}
                            onChange={(e) => setCustomAspectRatio(e.target.value)}
                         />
                      )}
                   </div>

                   <Button
                      size="icon"
                      className={cn(
                         "w-10 h-10 rounded-lg transition-all ml-auto",
                         isGenerating ? "bg-gray-400 cursor-not-allowed" : "bg-gray-400 hover:bg-gray-500 text-white"
                      )}
                      onClick={handleGenerate}
                      disabled={isGenerating}
                   >
                      {isGenerating ? <div className="w-4 h-4 border-2 border-white/50 border-t-white rounded-full animate-spin" /> : <ArrowUp className="w-5 h-5" />}
                   </Button>
                </div>
             </div>

             {/* 底部提示 */}
             <div className="max-w-3xl mx-auto mt-8 bg-[#FFF8F0] rounded-xl p-5 border border-orange-100">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
                   <div className="flex items-start gap-2 text-xs text-orange-700/80 leading-relaxed">
                      <span className="mt-0.5 text-orange-500 shrink-0">✦</span>
                      <p>生成图片仅保存在本地浏览器，请及时【下载】保存，图片数据会占用电脑系统盘空间，如空间不足可清理生图数据，注：删除浏览器缓存可删除所有生图数据。</p>
                   </div>
                   
                   <div className="flex items-start gap-2 text-xs text-orange-700/80 leading-relaxed">
                      <span className="mt-0.5 text-orange-500 shrink-0">✦</span>
                      <p>生图时请不要【刷新】网页，会中断生图。</p>
                   </div>

                   <div className="flex items-start gap-2 text-xs text-orange-700/80 leading-relaxed">
                      <span className="mt-0.5 text-orange-500 shrink-0">✦</span>
                      <p>生图失败请优先排查提示内容是否含敏感内容，可能是模型审核。</p>
                   </div>

                   <div className="flex items-start gap-2 text-xs text-orange-700/80 leading-relaxed">
                       <span className="mt-0.5 text-orange-500 shrink-0">✦</span>
                       <p>建议使用电脑联网生图，网络连接更稳定。</p>
                   </div>
                </div>

                <div className="pt-3 mt-3 border-t border-orange-200/50 flex items-start gap-2 text-xs text-orange-700/80 leading-relaxed font-medium">
                    <span className="mt-0.5 text-orange-500 shrink-0">※</span>
                    <p>本站聚合全球优秀生图模型，提供折扣价格且无需包月，按需充值，余额永久不过期，任意咨询或疑问可联系 👨🏼‍🦲微信号：HappyDong-</p>
                </div>
             </div>
        </div>
      </section>

      {/* 生成结果展示区域 */}
      {(generatedImages.length > 0) && (
         <section className="container mx-auto px-4 pb-20 max-w-7xl">
             <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {generatedImages.slice((page - 1) * pageSize, page * pageSize).map((item, idx) => (
                   <div
                      key={item.id}
                      className={cn(
                        "group relative rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all aspect-[2/3]",
                        item.status === 'failed' ? "bg-red-50 border border-red-100" : "bg-white border border-gray-100 cursor-pointer"
                      )}
                      onClick={() => {
                        if (item.status === 'success') {
                           setCurrentImageIndex(idx)
                           setShowImageDialog(true)
                        }
                      }}
                   >
                      {/* Loading State */}
                      {item.status === 'loading' && (
                          <div className="absolute inset-0 bg-[#FF6B00] flex flex-col items-center justify-center p-8 text-white z-20">
                              <div className="absolute inset-0 bg-white/5"></div>
                              <div className="relative z-10 flex flex-col items-center animate-pulse">
                                  <div className="w-12 h-12 border-4 border-white/30 border-t-white rounded-full animate-spin mb-4" />
                                  <h3 className="text-lg font-bold mb-1">正在绘制中...</h3>
                                  <LoadingTimer />
                              </div>
                          </div>
                      )}

                      {/* Failed State */}
                      {item.status === 'failed' && (
                          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center z-20">
                              <AlertTriangle className="w-10 h-10 text-red-500 mb-3" />
                              <h3 className="text-base font-semibold text-red-600 mb-2">生图失败</h3>
                              <p className="text-xs text-red-500/80 mb-1">模型请求或生成失败，请重新尝试。</p>
                              <p className="text-xs text-red-500/80">如连续多次失败，请暂时切换其它模型使用。也可以向站长反馈处理。</p>
                          </div>
                      )}

                      {/* Success State */}
                      {item.status === 'success' && item.url && (
                        <>
                           <Image
                              src={item.url}
                              alt={`Generated image ${idx + 1}`}
                              fill
                              className="object-cover transition-transform duration-500 group-hover:scale-105"
                              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                           />
                           
                           {/* 底部信息条 */}
                           <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/60 to-transparent">
                               <div className="flex justify-between items-center text-white/90 text-xs font-medium">
                                   <span>
                                       {modelOptions.find(m => m.value === item.model)?.label || item.model}
                                       {item.duration && ` • ${item.duration}`}
                                   </span>
                               </div>
                           </div>

                           {/* 悬浮遮罩 - 仅用于操作按钮 */}
                           <div className="absolute inset-0 bg-black/10 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-4">
                              <div className="flex justify-end items-center gap-2 mb-6">
                                  <button
                                     className="p-1.5 bg-black/30 hover:bg-black/50 text-white rounded-md transition-colors backdrop-blur-sm"
                                     onClick={(e) => {
                                        e.stopPropagation();
                                        setSourceImages([item.url!]);
                                        setIsImageToImage(true);
                                        toast.success("已设置为参考图");
                                     }}
                                     title="以此图生图"
                                  >
                                     <Edit className="w-4 h-4" />
                                  </button>
                                  <button
                                     className="p-1.5 bg-black/30 hover:bg-black/50 text-white rounded-md transition-colors backdrop-blur-sm"
                                     onClick={(e) => {
                                        e.stopPropagation();
                                        setCurrentImageIndex(idx)
                                        setShowImageDialog(true)
                                     }}
                                     title="查看大图"
                                  >
                                     <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                                  </button>
                                  <button
                                     className="p-1.5 bg-black/30 hover:bg-black/50 text-white rounded-md transition-colors backdrop-blur-sm"
                                     onClick={async (e) => {
                                        e.stopPropagation();
                                        try {
                                          const link = document.createElement('a');
                                          link.href = item.url!;
                                          link.download = `generated-${Date.now()}.png`;
                                          document.body.appendChild(link);
                                          link.click();
                                          document.body.removeChild(link);
                                        } catch (e) {
                                          console.error("Download failed", e);
                                        }
                                     }}
                                     title="下载图片"
                                  >
                                     <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                  </button>
                               </div>
                           </div>
                        </>
                      )}
                   </div>
                ))}
             </div>

             {/* Pagination */}
             {generatedImages.length > pageSize && (
                <div className="flex justify-center mt-8 gap-4">
                    <Button
                       variant="outline"
                       onClick={() => setPage(p => Math.max(1, p - 1))}
                       disabled={page === 1}
                    >
                       <ChevronLeft className="w-4 h-4 mr-2" />
                       上一页
                    </Button>
                    <span className="flex items-center text-sm text-muted-foreground">
                       Page {page} of {Math.ceil(generatedImages.length / pageSize)}
                    </span>
                    <Button
                       variant="outline"
                       onClick={() => setPage(p => Math.min(Math.ceil(generatedImages.length / pageSize), p + 1))}
                       disabled={page >= Math.ceil(generatedImages.length / pageSize)}
                    >
                       下一页
                       <ChevronRight className="w-4 h-4 ml-2" />
                    </Button>
                </div>
             )}
         </section>
      )}

      {/* 错误展示 - 使用空状态或单独区域 */}
      {error && (
         <div className="fixed top-20 right-4 z-50 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg shadow-lg max-w-sm animate-in slide-in-from-right fade-in">
             <div className="flex items-start gap-3">
                <Info className="w-5 h-5 shrink-0 mt-0.5" />
                <div className="text-sm">{error}</div>
                <button onClick={() => setError(null)} className="ml-auto hover:bg-red-100 p-1 rounded-full"><X className="w-4 h-4" /></button>
             </div>
         </div>
      )}

      {/* 底部版权 */}
      <footer className="py-8 text-center text-sm text-gray-400">
         <p>© 2024 Magic Image. All rights reserved.</p>
      </footer>

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
      <Dialog open={showImageDialog} onOpenChange={setShowImageDialog}>
        <DialogContent className="max-w-[95vw] w-full sm:max-w-[95vw] h-[90vh] p-0 border-0 bg-transparent shadow-none [&>button]:absolute [&>button]:top-4 [&>button]:right-4 [&>button]:bg-black/20 [&>button]:hover:bg-black/40 [&>button]:text-white [&>button]:w-10 [&>button]:h-10 [&>button]:rounded-full [&>button]:backdrop-blur-sm [&>button]:flex [&>button]:items-center [&>button]:justify-center [&>button]:z-50">
           <div className="visually-hidden">
             <DialogTitle>查看大图</DialogTitle>
             <DialogDescription>查看生成图片的详细预览</DialogDescription>
           </div>
          <div className="relative w-full h-full flex items-center justify-center bg-transparent">
            {generatedImages[currentImageIndex]?.url && (
               <Image
                 src={generatedImages[currentImageIndex].url!}
                 alt="Preview"
                 fill
                 className="object-contain"
                 quality={100}
                 priority
               />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </main>
  )
}

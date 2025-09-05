"use client"

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Plus,
  Upload,
  X,
  Image as ImageIcon,
  MessageSquare,
  Settings,
  Trash2,
  FileText
} from 'lucide-react'
import {
  BatchTask,
  TaskType,
  BatchTaskConfig,
  TaskItem,
  ModelType,
  AspectRatio,
  ImageSize
} from '@/types'
import { batchTaskManager } from '@/lib/batch-task-manager'
import { storage } from '@/lib/sqlite-storage'
import { toast } from 'sonner'
import { v4 as uuidv4 } from 'uuid'
import { ModelConfigDialog } from '@/components/model-config-dialog'

function isTauriEnv() {
  return typeof (window as any).__TAURI__ !== 'undefined'
}

async function pickDir(): Promise<string | undefined> {
  try {
    if (isTauriEnv()) {
      const tauri = (window as any).__TAURI__
      const dialog = tauri?.dialog
      if (dialog?.open) {
        const selected = await dialog.open({ directory: true, multiple: false })
        if (typeof selected === 'string') return selected
      }
    }
    return undefined
  } catch {
    return undefined
  }
}

interface BatchTaskCreatorProps {
  onTaskCreated: (task: BatchTask) => void
  currentModel?: string
  currentModelType?: ModelType
  editingTask?: BatchTask | null
  onTaskUpdated?: (task: BatchTask) => void
}

export function BatchTaskCreator({ onTaskCreated, currentModel, currentModelType, editingTask, onTaskUpdated }: BatchTaskCreatorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [taskName, setTaskName] = useState(() => {
    const d = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    const local = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`
    return local
  })
  const [taskType, setTaskType] = useState<TaskType>(TaskType.TEXT_TO_IMAGE)
  const [prompts, setPrompts] = useState<string[]>([''])
  const [sourceImages, setSourceImages] = useState<string[]>([])
  const [model, setModel] = useState<string>(currentModel || 'sora_image')
  const [modelType, setModelType] = useState<ModelType>(currentModelType || ModelType.OPENAI)
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('1:1')
  const [size, setSize] = useState<ImageSize>('1024x1024')
  const [quality, setQuality] = useState<'auto' | 'high' | 'medium' | 'low' | 'hd' | 'standard'>('auto')
  const [concurrentLimit, setConcurrentLimit] = useState(3)
  const [retryAttempts, setRetryAttempts] = useState(3)
  const [retryDelay, setRetryDelay] = useState(1000)
  const [autoDownload, setAutoDownload] = useState(true)
  const [apiTimeoutMs, setApiTimeoutMs] = useState<number>(300000)
  const [generateCount, setGenerateCount] = useState(1) // 每个提示词的生成次数
  const [image2ImageMode, setImage2ImageMode] = useState<'multi_images_single_prompt' | 'single_image_multi_generations'>('multi_images_single_prompt')

  const fileInputRef = useRef<HTMLInputElement>(null)
  const dirInputRef = useRef<HTMLInputElement>(null)

  // 编辑模式初始化
  useEffect(() => {
    if (editingTask) {
      setTaskName(editingTask.name)
      setTaskType(editingTask.type)
      setModel(editingTask.config.model)
      setModelType(editingTask.config.modelType)
      setAspectRatio(editingTask.config.aspectRatio)
      setSize(editingTask.config.size)
      setConcurrentLimit(editingTask.config.concurrentLimit)
      setRetryAttempts(editingTask.config.retryAttempts)
      setRetryDelay(editingTask.config.retryDelay)
      setAutoDownload(editingTask.config.autoDownload)
      setGenerateCount(editingTask.config.generateCount || 1)
      setImage2ImageMode('multi_images_single_prompt')
      
      // 从任务项中提取提示词
      const uniquePrompts = [...new Set(editingTask.items.map(item => item.prompt))]
      setPrompts(uniquePrompts.length > 0 ? uniquePrompts : [''])
      
      // 从任务项中提取源图片
      const uniqueImages = [...new Set(editingTask.items.map(item => item.sourceImage).filter((v): v is string => Boolean(v)))]
      setSourceImages(uniqueImages)
      
      setIsOpen(true)
    }
  }, [editingTask])

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (files && files.length > 0) {
      Array.from(files).forEach(file => {
        if (file.size > 4 * 1024 * 1024) {
          toast.error("图片大小不能超过4MB")
          return
        }

        if (!['image/jpeg', 'image/png'].includes(file.type)) {
          toast.error("只支持JPG和PNG格式的图片")
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
  }

  const handleAddPrompt = () => {
    setPrompts(prev => [...prev, ''])
  }

  const handleRemovePrompt = (index: number) => {
    if (prompts.length > 1) {
      setPrompts(prev => prev.filter((_, i) => i !== index))
    }
  }

  const handlePromptChange = (index: number, value: string) => {
    setPrompts(prev => prev.map((prompt, i) => i === index ? value : prompt))
  }

  const handleImportPrompts = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (e) => {
      const content = e.target?.result as string
      const lines = content.split('\n').filter(line => line.trim())
      if (lines.length > 0) {
        setPrompts(lines)
        toast.success(`成功导入 ${lines.length} 个提示词`)
      }
    }
    reader.readAsText(file)
  }

  const validateForm = () => {
    if (!taskName.trim()) {
      toast.error('请输入任务名称')
      return false
    }

    const validPrompts = prompts.filter(p => p.trim())
    if (validPrompts.length === 0) {
      toast.error('请至少输入一个提示词')
      return false
    }

    if (taskType === TaskType.IMAGE_TO_IMAGE) {
      if (sourceImages.length === 0) {
        toast.error('图生图模式需要至少上传一张图片')
        return false
      }
      if (image2ImageMode === 'multi_images_single_prompt') {
        if (validPrompts.length !== 1) {
          toast.error('“多图+单提示词”模式仅支持一个提示词')
          return false
        }
      }
      if (image2ImageMode === 'single_image_multi_generations') {
        if (sourceImages.length !== 1) {
          toast.error('“单图+单提示词（多次生成）”模式仅支持一张图片')
          return false
        }
        if (validPrompts.length !== 1) {
          toast.error('“单图+单提示词（多次生成）”模式仅支持一个提示词')
          return false
        }
      }
    }

    return true
  }

  const handleCreateTask = async () => {
    if (!validateForm()) return

    const validPrompts = prompts.filter(p => p.trim())

    const finalTaskName = taskName.trim() || new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)

    const taskItems: Omit<TaskItem, 'id' | 'status' | 'attemptCount' | 'createdAt'>[] = []

    if (taskType === TaskType.IMAGE_TO_IMAGE) {
      if (image2ImageMode === 'multi_images_single_prompt') {
        // 多图 + 单提示词：每张图片 × 1 次
        const onlyPrompt = validPrompts[0]
        sourceImages.forEach(sourceImage => {
          taskItems.push({
            prompt: onlyPrompt,
            sourceImage,
            priority: 1
          })
        })
      } else if (image2ImageMode === 'single_image_multi_generations') {
        // 单图 + 单提示词（多次生成）：同一图片重复 generateCount 次
        const onlyPrompt = validPrompts[0]
        const onlyImage = sourceImages[0]
        for (let i = 0; i < generateCount; i++) {
          taskItems.push({
            prompt: onlyPrompt,
            sourceImage: onlyImage,
            priority: 1
          })
        }
      }
    } else if (taskType === TaskType.MIXED) {
      // 混合模式：每个提示词可以选择对应的图片，每个组合生成多次
      validPrompts.forEach((prompt, index) => {
        for (let i = 0; i < generateCount; i++) {
          taskItems.push({
            prompt: prompt,
            sourceImage: sourceImages[index] || undefined,
            priority: 1
          })
        }
      })
    } else {
      // 文生图模式：每个提示词生成多次
      validPrompts.forEach(prompt => {
        for (let i = 0; i < generateCount; i++) {
          taskItems.push({
            prompt: prompt,
            priority: 1
          })
        }
      })
    }

    const config: BatchTaskConfig = {
      model,
      modelType,
      concurrentLimit,
      retryAttempts,
      retryDelay,
      autoDownload,
      aspectRatio,
      size,
      quality,
      generateCount
    }

    if (editingTask) {
      // 编辑模式：更新现有任务
      const updatedTask: BatchTask = {
        ...editingTask,
        name: finalTaskName,
        type: taskType,
        config,
        items: taskItems.map((item, index) => ({
          ...item,
          id: `item_${Date.now()}_${index}`,
          status: 'pending' as any,
          attemptCount: 0,
          createdAt: new Date().toISOString()
        })),
        totalItems: taskItems.length,
        completedItems: 0,
        failedItems: 0,
        progress: 0,
        status: 'pending' as any
      }

      try {
        await storage.saveBatchTask(updatedTask)
        if (onTaskUpdated) {
          onTaskUpdated(updatedTask)
        }
        toast.success(`批量任务 "${finalTaskName}" 已更新，包含 ${taskItems.length} 个任务项`)
      } catch (error) {
        console.error('保存任务失败:', error)
        toast.error(error instanceof Error ? error.message : '保存任务失败，存储空间可能不足')
        return // 不继续执行后续重置逻辑
      }
    } else {
      // 创建模式：创建新任务
      const taskId = batchTaskManager.createTask(finalTaskName, taskItems, config, taskType)
      const task = batchTaskManager.getTask(taskId)

      if (task) {
        try {
          await storage.saveBatchTask(task)
          onTaskCreated(task)
          toast.success(`批量任务 "${finalTaskName}" 已创建，包含 ${taskItems.length} 个任务项`)
        } catch (error) {
          console.error('保存任务失败:', error)
          // 如果保存失败，从内存中删除任务
          batchTaskManager.deleteTask(taskId)
          toast.error(error instanceof Error ? error.message : '保存任务失败，存储空间可能不足')
          return // 不继续执行后续重置逻辑
        }
      }
    }

    // 重置表单
    setTaskName(() => {
      const d = new Date()
      const pad = (n: number) => String(n).padStart(2, '0')
      return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`
    })
    setPrompts([''])
    setSourceImages([])
    setTaskType(TaskType.TEXT_TO_IMAGE)
    setGenerateCount(1)
    setImage2ImageMode('multi_images_single_prompt')
    setIsOpen(false)
  }

  const getAvailableModels = () => {
    const customModels = storage.getCustomModels()
    const builtInModels = [
      { value: 'sora_image', name: 'GPT Sora_Image 模型', type: ModelType.OPENAI },
      { value: 'gpt_4o_image', name: 'GPT 4o_Image 模型', type: ModelType.OPENAI },
      { value: 'gpt-image-1', name: 'GPT Image 1 模型', type: ModelType.DALLE },
      { value: 'dall-e-3', name: 'DALL-E 3 模型', type: ModelType.DALLE },
      { value: 'gemini-2.5-flash-image-preview', name: 'Gemini 2.5 模型', type: ModelType.GEMINI }
    ]

    return [...builtInModels, ...customModels]
  }

  const getTaskTypeIcon = (type: TaskType) => {
    switch (type) {
      case TaskType.TEXT_TO_IMAGE:
        return <MessageSquare className="h-4 w-4" />
      case TaskType.IMAGE_TO_IMAGE:
        return <ImageIcon className="h-4 w-4" />
      case TaskType.MIXED:
        return <Settings className="h-4 w-4" />
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button className="px-6">
          <Plus className="h-4 w-4 mr-2" />
          创建批量任务
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-5xl max-h-[82vh] w-[92vw]">
        <DialogHeader>
          <DialogTitle className="text-xl">创建批量任务</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col max-h-[calc(82vh-6rem)]">
          <ScrollArea className="flex-1 max-h-full pr-4">
            <div className="space-y-6">
              {/* 第一行：基本信息和模型配置 */}
              <div className="grid grid-cols-1 2xl:grid-cols-2 gap-6">
                {/* 基本信息 */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">基本信息</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="taskName">任务名称</Label>
                      <Input
                        id="taskName"
                        placeholder="输入任务名称"
                        value={taskName}
                        onChange={(e) => setTaskName(e.target.value)}
                        className="h-10"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="taskType">任务类型</Label>
                      <Select value={taskType} onValueChange={(value: TaskType) => setTaskType(value)}>
                        <SelectTrigger className="h-10">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={TaskType.TEXT_TO_IMAGE}>
                            <div className="flex items-center gap-2">
                              <MessageSquare className="h-4 w-4" />
                              文生图
                            </div>
                          </SelectItem>
                          <SelectItem value={TaskType.IMAGE_TO_IMAGE}>
                            <div className="flex items-center gap-2">
                              <ImageIcon className="h-4 w-4" />
                              图生图
                            </div>
                          </SelectItem>
                          <SelectItem value={TaskType.MIXED}>
                            <div className="flex items-center gap-2">
                              <Settings className="h-4 w-4" />
                              混合模式
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </CardContent>
                </Card>

                {/* 模型配置 */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">模型配置</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="model">AI模型</Label>
                      <Select 
                        value={(storage.getCustomModels().some(cm => cm.value === model && cm.type === modelType)) ? `${modelType}::${model}` : model}
                        onValueChange={(value: string) => {
                          if (typeof value === 'string' && value.includes('::')) {
                            const [typeStr, modelVal] = value.split('::')
                            setModel(modelVal as any)
                            setModelType(typeStr as unknown as ModelType)
                          } else {
                            setModel(value as any)
                          }
                        }}
                      >
                        <SelectTrigger>
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
                                  {customModel.name}
                                </SelectItem>
                              ))}
                            </>
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                    {/* 根据模型类型显示不同的参数 */}
                    {(model === 'dall-e-3' || model === 'gpt-image-1' || modelType === ModelType.DALLE || model === 'gemini-2.5-flash-image-preview' || modelType === ModelType.GEMINI) ? (
                      <>
                        <div className="space-y-2">
                          <Label htmlFor="size">图片尺寸</Label>
                          <Select value={size} onValueChange={(value: ImageSize) => setSize(value)}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="1024x1024">1024x1024</SelectItem>
                              <SelectItem value="1536x1024">1536x1024</SelectItem>
                              <SelectItem value="1024x1536">1024x1536</SelectItem>
                              <SelectItem value="1792x1024">1792x1024</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        {taskType === TaskType.IMAGE_TO_IMAGE && (
                          <div className="space-y-2">
                            <Label htmlFor="quality">图片质量</Label>
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
                                ) : (
                                  <SelectItem value="auto">自动选择</SelectItem>
                                )}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="space-y-2">
                        <Label htmlFor="aspectRatio">图片比例</Label>
                        <Select value={aspectRatio} onValueChange={(value: AspectRatio) => setAspectRatio(value)}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1:1">1:1 方形</SelectItem>
                            <SelectItem value="16:9">16:9 宽屏</SelectItem>
                            <SelectItem value="9:16">9:16 竖屏</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
              </div>

              {/* 第二行：提示词配置 */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">提示词配置</CardTitle>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <Label htmlFor="generateCount" className="text-sm font-medium">生成次数：</Label>
                        <Input
                          id="generateCount"
                          type="number"
                          min="1"
                          max="100"
                          value={generateCount}
                          onChange={(e) => setGenerateCount(parseInt(e.target.value) || 1)}
                          className="w-24 h-8"
                        />
                      </div>
                      <div className="text-sm text-gray-600">
                        已配置 {prompts.filter(p => p.trim()).length} 个提示词 × {generateCount} 次
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={handleAddPrompt}>
                        <Plus className="h-4 w-4 mr-1" />
                        添加
                      </Button>
                      <label>
                        <Button variant="outline" size="sm" asChild>
                          <span>
                            <FileText className="h-4 w-4 mr-1" />
                            导入
                          </span>
                        </Button>
                        <input
                          type="file"
                          accept=".txt"
                          className="hidden"
                          onChange={handleImportPrompts}
                        />
                      </label>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3 max-h-80 overflow-y-auto">
                    {prompts.map((prompt, index) => (
                      <div key={index} className="flex gap-3 p-3 border rounded-lg bg-gray-50/50">
                        <div className="flex-1">
                          <Textarea
                            placeholder={`提示词 ${index + 1}`}
                            value={prompt}
                            onChange={(e) => handlePromptChange(index, e.target.value)}
                            className="w-full min-h-[100px] resize-none border-0 bg-transparent focus:ring-0 focus:ring-offset-0"
                          />
                        </div>
                        {prompts.length > 1 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemovePrompt(index)}
                            className="self-start h-8 w-8 p-0 hover:bg-red-100 hover:text-red-600"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {taskType === TaskType.IMAGE_TO_IMAGE && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">图生图模式</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <Button
                        variant={image2ImageMode === 'multi_images_single_prompt' ? 'secondary' : 'outline'}
                        onClick={() => setImage2ImageMode('multi_images_single_prompt')}
                      >
                        多图 + 单提示词（逐张生成）
                      </Button>
                      <Button
                        variant={image2ImageMode === 'single_image_multi_generations' ? 'secondary' : 'outline'}
                        onClick={() => setImage2ImageMode('single_image_multi_generations')}
                      >
                        单图 + 单提示词（多次生成）
                      </Button>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                      根据模式不同，系统会自动计算任务项：
                      多图单词条=按图片数量；单图多次=按生成次数。
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* 第三行：图片上传 */}
              {(taskType === TaskType.IMAGE_TO_IMAGE || taskType === TaskType.MIXED) && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">图片上传</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div
                        className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        {sourceImages.length > 0 ? (
                          <div className="max-h-80 overflow-y-auto grid grid-cols-8 md:grid-cols-12 gap-2 p-2 pt-3 pr-3">
                            {sourceImages.map((image, index) => (
                              <div key={index} className="relative aspect-square w-14 h-14 md:w-16 md:h-16">
                                <Image
                                  src={image}
                                  alt={`Source ${index + 1}`}
                                  fill
                                  className="object-cover rounded-lg"
                                />
                                <Button
                                  variant="destructive"
                                  size="icon"
                                  className="absolute -top-1 -right-1 h-5 w-5 rounded-full"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleRemoveImage(index)
                                  }}
                                >
                                  <X className="h-3 w-3" />
                                </Button>
                              </div>
                            ))}
                            <div className="flex items-center justify-center aspect-square w-14 h-14 md:w-16 md:h-16 border-2 border-dashed rounded-lg">
                              <Plus className="h-8 w-8 text-gray-400" />
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center gap-3 text-gray-500">
                            <Upload className="h-8 w-8" />
                            <p className="text-base">点击上传图片</p>
                            <p className="text-sm">{taskType === TaskType.IMAGE_TO_IMAGE && image2ImageMode === 'single_image_multi_generations' ? '该模式仅需上传一张图片' : '支持多张图片'}</p>
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
                  </CardContent>
                </Card>
              )}

              {/* 第四行：高级配置 - 单独一行 */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">高级配置</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="concurrentLimit">并发数量</Label>
                      <Input
                        id="concurrentLimit"
                        type="number"
                        min="1"
                        max="10"
                        value={concurrentLimit}
                        onChange={(e) => setConcurrentLimit(parseInt(e.target.value) || 1)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="retryAttempts">重试次数</Label>
                      <Input
                        id="retryAttempts"
                        type="number"
                        min="0"
                        max="10"
                        value={retryAttempts}
                        onChange={(e) => setRetryAttempts(parseInt(e.target.value) || 0)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="retryDelay">重试延迟(ms)</Label>
                      <Input
                        id="retryDelay"
                        type="number"
                        min="100"
                        max="10000"
                        value={retryDelay}
                        onChange={(e) => setRetryDelay(parseInt(e.target.value) || 100)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="apiTimeoutMs">超时时间(ms)</Label>
                      <Input
                        id="apiTimeoutMs"
                        type="number"
                        min="10000"
                        max="900000"
                        value={apiTimeoutMs}
                        onChange={(e) => setApiTimeoutMs(parseInt(e.target.value) || 300000)}
                      />
                    </div>
                    <div className="flex items-center space-x-2 pt-8">
                      <Switch
                        id="autoDownload"
                        checked={autoDownload}
                        onCheckedChange={setAutoDownload}
                      />
                      <Label htmlFor="autoDownload">自动下载</Label>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-base font-medium">下载目录</Label>
                    <Input
                      value={storage.getDownloadConfig().defaultPath || ''}
                      placeholder="请输入下载目录（桌面端优先，浏览器默认下载目录）"
                      onChange={(e) => {
                        const v = e.target.value
                        const cfg = storage.getDownloadConfig()
                        storage.saveDownloadConfig({ ...cfg, defaultPath: v })
                      }}
                      className="h-10"
                    />
                  </div>
                </CardContent>
              </Card>
            </div>
          </ScrollArea>

          <div className="flex justify-between items-center pt-4 border-t mt-4">
            <div className="text-sm text-gray-500">
              {editingTask ? '编辑任务配置' : '请确保已配置 API 密钥后再创建任务'}
            </div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => {
                setIsOpen(false)
              }} className="px-8">
                取消
              </Button>
              <Button onClick={handleCreateTask} className="px-8">
                {editingTask ? '更新任务' : '创建任务'}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
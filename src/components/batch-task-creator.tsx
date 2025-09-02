"use client"

import { useState, useEffect } from 'react'
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
import { storage } from '@/lib/storage'
import { toast } from 'sonner'
import { v4 as uuidv4 } from 'uuid'
import { ModelConfigDialog } from '@/components/model-config-dialog'

interface BatchTaskCreatorProps {
  onTaskCreated: (task: BatchTask) => void
  currentModel?: string
  currentModelType?: ModelType
  editingTask?: BatchTask | null
  onTaskUpdated?: (task: BatchTask) => void
}

export function BatchTaskCreator({ onTaskCreated, currentModel, currentModelType, editingTask, onTaskUpdated }: BatchTaskCreatorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [taskName, setTaskName] = useState('')
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
  const [generateCount, setGenerateCount] = useState(1) // 每个提示词的生成次数

  const fileInputRef = useState<React.RefObject<HTMLInputElement>>({ current: null })[0]

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
      
      // 从任务项中提取提示词
      const uniquePrompts = [...new Set(editingTask.items.map(item => item.prompt))]
      setPrompts(uniquePrompts.length > 0 ? uniquePrompts : [''])
      
      // 从任务项中提取源图片
      const uniqueImages = [...new Set(editingTask.items.map(item => item.sourceImage).filter(Boolean))]
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

    if (taskType === TaskType.IMAGE_TO_IMAGE && sourceImages.length === 0) {
      toast.error('图生图模式需要至少上传一张图片')
      return false
    }

    return true
  }

  const handleCreateTask = () => {
    if (!validateForm()) return

    const validPrompts = prompts.filter(p => p.trim())

    const taskItems: Omit<TaskItem, 'id' | 'status' | 'attemptCount' | 'createdAt'>[] = []

    if (taskType === TaskType.IMAGE_TO_IMAGE) {
      // 图生图模式：每个提示词对应每张图片，每个组合生成多次
      validPrompts.forEach(prompt => {
        sourceImages.forEach(sourceImage => {
          for (let i = 0; i < generateCount; i++) {
            taskItems.push({
              prompt: `${prompt} (第${i + 1}张)`,
              sourceImage,
              priority: 1
            })
          }
        })
      })
    } else if (taskType === TaskType.MIXED) {
      // 混合模式：每个提示词可以选择对应的图片，每个组合生成多次
      validPrompts.forEach((prompt, index) => {
        for (let i = 0; i < generateCount; i++) {
          taskItems.push({
            prompt: `${prompt} (第${i + 1}张)`,
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
            prompt: `${prompt} (第${i + 1}张)`,
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
        name: taskName,
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

      storage.saveBatchTask(updatedTask)
      if (onTaskUpdated) {
        onTaskUpdated(updatedTask)
      }
      toast.success(`批量任务 "${taskName}" 已更新，包含 ${taskItems.length} 个任务项`)
    } else {
      // 创建模式：创建新任务
      const taskId = batchTaskManager.createTask(taskName, taskItems, config, taskType)
      const task = batchTaskManager.getTask(taskId)

      if (task) {
        storage.saveBatchTask(task)
        onTaskCreated(task)
        toast.success(`批量任务 "${taskName}" 已创建，包含 ${taskItems.length} 个任务项`)
      }
    }

    // 重置表单
    setTaskName('')
    setPrompts([''])
    setSourceImages([])
    setTaskType(TaskType.TEXT_TO_IMAGE)
    setGenerateCount(1)
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
      <DialogContent className="max-w-7xl max-h-[90vh] w-[90vw]">
        <DialogHeader>
          <DialogTitle className="text-xl">创建批量任务</DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[80vh] pr-6">
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
                      已配置 {prompts.filter(p => p.trim()).length} 个提示词 × {generateCount} 次 = 预计 {prompts.filter(p => p.trim()).length * generateCount} 个任务
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
                        <div className="grid grid-cols-3 gap-3">
                          {sourceImages.map((image, index) => (
                            <div key={index} className="relative aspect-square">
                              <Image
                                src={image}
                                alt={`Source ${index + 1}`}
                                fill
                                className="object-cover rounded-lg"
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
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          ))}
                          {sourceImages.length < 9 && (
                            <div className="flex items-center justify-center aspect-square border-2 border-dashed rounded-lg">
                              <Plus className="h-8 w-8 text-gray-400" />
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-3 text-gray-500">
                          <Upload className="h-8 w-8" />
                          <p className="text-base">点击上传图片</p>
                          <p className="text-sm">支持多张图片，最多9张</p>
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
                  <div className="flex items-center space-x-2 pt-8">
                    <Switch
                      id="autoDownload"
                      checked={autoDownload}
                      onCheckedChange={setAutoDownload}
                    />
                    <Label htmlFor="autoDownload">自动下载</Label>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* 第五行：任务预览 */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">任务预览</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-6">
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <p className="text-sm text-gray-600 mb-2">任务类型</p>
                    <div className="flex items-center gap-2">
                      {getTaskTypeIcon(taskType)}
                      <span className="font-medium">
                        {taskType === TaskType.TEXT_TO_IMAGE ? '文生图' :
                         taskType === TaskType.IMAGE_TO_IMAGE ? '图生图' : '混合模式'}
                      </span>
                    </div>
                  </div>
                  <div className="bg-green-50 p-4 rounded-lg">
                    <p className="text-sm text-gray-600 mb-2">提示词数量</p>
                    <p className="text-2xl font-bold text-green-600">{prompts.filter(p => p.trim()).length}</p>
                  </div>
                  <div className="bg-purple-50 p-4 rounded-lg">
                    <p className="text-sm text-gray-600 mb-2">图片数量</p>
                    <p className="text-2xl font-bold text-purple-600">{sourceImages.length}</p>
                  </div>
                  <div className="bg-orange-50 p-4 rounded-lg">
                    <p className="text-sm text-gray-600 mb-2">预计任务数</p>
                    <p className="text-2xl font-bold text-orange-600">
                      {taskType === TaskType.IMAGE_TO_IMAGE
                        ? prompts.filter(p => p.trim()).length * sourceImages.length * generateCount
                        : prompts.filter(p => p.trim()).length * generateCount}
                    </p>
                  </div>
                  <div className="bg-red-50 p-4 rounded-lg">
                    <p className="text-sm text-gray-600 mb-2">生成次数</p>
                    <p className="text-2xl font-bold text-red-600">{generateCount}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </ScrollArea>

        <div className="flex justify-between items-center pt-6 border-t mt-6">
          <div className="text-sm text-gray-500">
            {editingTask ? '编辑任务配置' : '请确保已配置 API 密钥后再创建任务'}
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => {
              setIsOpen(false)
              setEditingTask(null)
            }} className="px-8">
              取消
            </Button>
            <Button onClick={handleCreateTask} className="px-8">
              {editingTask ? '更新任务' : '创建任务'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
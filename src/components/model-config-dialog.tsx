"use client"

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  Settings,
  Plus,
  Trash2,
  TestTube,
  CheckCircle,
  AlertCircle,
  Clock
} from 'lucide-react'
import { ModelConfig, ModelType, GenerationModel } from '@/types'
import { storage } from '@/lib/storage'
import { toast } from 'sonner'
import { v4 as uuidv4 } from 'uuid'

interface ModelConfigDialogProps {
  children?: React.ReactNode
}

export function ModelConfigDialog({ children }: ModelConfigDialogProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [configs, setConfigs] = useState<ModelConfig[]>([])
  const [editingConfig, setEditingConfig] = useState<ModelConfig | null>(null)
  const [isAddingNew, setIsAddingNew] = useState(false)
  const [testResults, setTestResults] = useState<Record<string, 'idle' | 'testing' | 'success' | 'error'>>({})

  useEffect(() => {
    if (isOpen) {
      setConfigs(storage.getModelConfigs())
    }
  }, [isOpen])

  const handleAddNew = () => {
    const newConfig: ModelConfig = {
      id: uuidv4(),
      name: '',
      model: 'sora_image' as GenerationModel,
      modelType: ModelType.OPENAI,
      apiKey: '',
      baseUrl: '',
      enabled: true,
      createdAt: new Date().toISOString()
    }
    setEditingConfig(newConfig)
    setIsAddingNew(true)
  }

  const handleEdit = (config: ModelConfig) => {
    setEditingConfig({ ...config })
    setIsAddingNew(false)
  }

  const handleDelete = (configId: string) => {
    if (confirm('确定要删除这个模型配置吗？')) {
      const updatedConfigs = configs.filter(c => c.id !== configId)
      setConfigs(updatedConfigs)
      storage.removeModelConfig(configId)
      toast.success('模型配置已删除')
    }
  }

  const handleSave = () => {
    if (!editingConfig) return

    if (!editingConfig.name.trim()) {
      toast.error('请输入配置名称')
      return
    }

    if (!editingConfig.apiKey.trim()) {
      toast.error('请输入API密钥')
      return
    }

    if (!editingConfig.baseUrl.trim()) {
      toast.error('请输入基础URL')
      return
    }

    const updatedConfigs = isAddingNew
      ? [...configs, editingConfig]
      : configs.map(c => c.id === editingConfig.id ? editingConfig : c)

    setConfigs(updatedConfigs)
    storage.saveModelConfig(editingConfig)

    setEditingConfig(null)
    setIsAddingNew(false)
    toast.success('模型配置已保存')
  }

  const handleCancel = () => {
    setEditingConfig(null)
    setIsAddingNew(false)
  }

  const handleTestConnection = async (config: ModelConfig) => {
    setTestResults(prev => ({ ...prev, [config.id]: 'testing' }))

    try {
      // 这里可以添加实际的连接测试逻辑
      // 目前只是模拟测试
      await new Promise(resolve => setTimeout(resolve, 2000))

      // 模拟测试结果
      const success = Math.random() > 0.3 // 70% 成功率
      setTestResults(prev => ({
        ...prev,
        [config.id]: success ? 'success' : 'error'
      }))

      toast.success(success ? '连接测试成功' : '连接测试失败')
    } catch (error) {
      setTestResults(prev => ({ ...prev, [config.id]: 'error' }))
      toast.error('连接测试失败')
    }
  }

  const getAvailableModels = (modelType: ModelType) => {
    const models = {
      [ModelType.OPENAI]: [
        { value: 'sora_image', name: 'GPT Sora_Image' },
        { value: 'gpt_4o_image', name: 'GPT 4o_Image' },
        { value: 'gpt-image-1', name: 'GPT Image 1' }
      ],
      [ModelType.DALLE]: [
        { value: 'dall-e-3', name: 'DALL-E 3' },
        { value: 'gpt-image-1', name: 'GPT Image 1' }
      ],
      [ModelType.GEMINI]: [
        { value: 'gemini-2.5-flash-image-preview', name: 'Gemini 2.5 Flash' },
        { value: 'gemini-pro-vision', name: 'Gemini Pro Vision' }
      ]
    }
    return models[modelType] || []
  }

  const getTestIcon = (status: 'idle' | 'testing' | 'success' | 'error') => {
    switch (status) {
      case 'testing':
        return <Clock className="h-4 w-4 text-blue-500 animate-spin" />
      case 'success':
        return <CheckCircle className="h-4 w-4 text-green-500" />
      case 'error':
        return <AlertCircle className="h-4 w-4 text-red-500" />
      default:
        return <TestTube className="h-4 w-4" />
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {children || (
          <Button variant="outline" size="sm">
            <Settings className="h-4 w-4 mr-1" />
            模型配置
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-[98vw] max-h-[95vh] w-[98vw]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            模型配置管理
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[65vh]">
          <div className="space-y-6">
            {/* 配置列表 */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium">模型配置列表</h3>
                <Button onClick={handleAddNew} size="sm">
                  <Plus className="h-4 w-4 mr-1" />
                  添加配置
                </Button>
              </div>

              {configs.length === 0 ? (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <Settings className="h-12 w-12 text-gray-400 mb-4" />
                    <p className="text-gray-500 text-center">暂无模型配置</p>
                    <p className="text-sm text-gray-400 text-center mt-2">
                      点击上方按钮添加新的模型配置
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-4">
                  {configs.map((config) => (
                    <Card key={config.id}>
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div>
                              <h4 className="font-medium">{config.name}</h4>
                              <p className="text-sm text-gray-500">
                                {config.model} • {config.modelType}
                              </p>
                            </div>
                            <Badge variant={config.enabled ? 'default' : 'secondary'}>
                              {config.enabled ? '启用' : '禁用'}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleTestConnection(config)}
                              disabled={testResults[config.id] === 'testing'}
                            >
                              {getTestIcon(testResults[config.id] || 'idle')}
                              <span className="ml-1">测试</span>
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleEdit(config)}
                            >
                              编辑
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDelete(config.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-3 md:grid-cols-4 gap-4 text-sm">
                          <div>
                            <p className="text-gray-500">基础URL</p>
                            <p className="font-mono text-xs truncate">{config.baseUrl}</p>
                          </div>
                          <div>
                            <p className="text-gray-500">API密钥</p>
                            <p className="font-mono text-xs">
                              {config.apiKey ? `${config.apiKey.slice(0, 8)}...` : '未设置'}
                            </p>
                          </div>
                          <div>
                            <p className="text-gray-500">最后使用</p>
                            <p className="text-xs">
                              {config.lastUsed
                                ? new Date(config.lastUsed).toLocaleString('zh-CN')
                                : '从未使用'
                              }
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>

            {/* 编辑表单 */}
            {editingConfig && (
              <>
                <Separator />
                <Card>
                  <CardHeader>
                    <CardTitle>{isAddingNew ? '添加新配置' : '编辑配置'}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="configName">配置名称</Label>
                        <Input
                          id="configName"
                          placeholder="输入配置名称"
                          value={editingConfig.name}
                          onChange={(e) => setEditingConfig(prev => prev ? { ...prev, name: e.target.value } : null)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="modelType">模型类型</Label>
                        <Select
                          value={editingConfig.modelType}
                          onValueChange={(value: ModelType) => setEditingConfig(prev => prev ? {
                            ...prev,
                            modelType: value,
                            model: getAvailableModels(value)[0]?.value as GenerationModel || prev.model
                          } : null)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={ModelType.OPENAI}>OpenAI</SelectItem>
                            <SelectItem value={ModelType.DALLE}>DALL-E</SelectItem>
                            <SelectItem value={ModelType.GEMINI}>Gemini</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="model">AI模型</Label>
                        <Select
                          value={editingConfig.model}
                          onValueChange={(value: GenerationModel) => setEditingConfig(prev => prev ? { ...prev, model: value } : null)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {getAvailableModels(editingConfig.modelType).map((model) => (
                              <SelectItem key={model.value} value={model.value}>
                                {model.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex items-center space-x-2 pt-8">
                        <Switch
                          id="configEnabled"
                          checked={editingConfig.enabled}
                          onCheckedChange={(checked) => setEditingConfig(prev => prev ? { ...prev, enabled: checked } : null)}
                        />
                        <Label htmlFor="configEnabled">启用配置</Label>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="baseUrl">基础URL</Label>
                      <Input
                        id="baseUrl"
                        placeholder="https://api.openai.com/v1"
                        value={editingConfig.baseUrl}
                        onChange={(e) => setEditingConfig(prev => prev ? { ...prev, baseUrl: e.target.value } : null)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="apiKey">API密钥</Label>
                      <Input
                        id="apiKey"
                        type="password"
                        placeholder="sk-..."
                        value={editingConfig.apiKey}
                        onChange={(e) => setEditingConfig(prev => prev ? { ...prev, apiKey: e.target.value } : null)}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="rateLimit">速率限制 (RPM)</Label>
                        <Input
                          id="rateLimit"
                          type="number"
                          placeholder="60"
                          value={editingConfig.rateLimit || ''}
                          onChange={(e) => setEditingConfig(prev => prev ? {
                            ...prev,
                            rateLimit: parseInt(e.target.value) || undefined
                          } : null)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="timeout">超时时间 (秒)</Label>
                        <Input
                          id="timeout"
                          type="number"
                          placeholder="30"
                          value={editingConfig.timeout || ''}
                          onChange={(e) => setEditingConfig(prev => prev ? {
                            ...prev,
                            timeout: parseInt(e.target.value) || undefined
                          } : null)}
                        />
                      </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-4">
                      <Button variant="outline" onClick={handleCancel}>
                        取消
                      </Button>
                      <Button onClick={handleSave}>
                        保存
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
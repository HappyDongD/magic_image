import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useState, useEffect } from "react"
import { storage } from "@/lib/storage"
import { CustomModel, ModelType } from "@/types"
import { toast } from "sonner"
import { v4 as uuidv4 } from "uuid"
import { Trash2, Plus, Edit } from "lucide-react"

interface CustomModelDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelectModel?: (model: string, type: ModelType) => void
}

export function CustomModelDialog({ open, onOpenChange, onSelectModel }: CustomModelDialogProps) {
  const [models, setModels] = useState<CustomModel[]>([])
  const [modelName, setModelName] = useState("")
  const [modelValue, setModelValue] = useState("")
  const [modelType, setModelType] = useState<ModelType>(ModelType.OPENAI)
  const [editingModelId, setEditingModelId] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      const savedModels = storage.getCustomModels()
      setModels(savedModels)
    }
  }, [open])

  const resetForm = () => {
    setModelName("")
    setModelValue("")
    setModelType(ModelType.OPENAI)
    setEditingModelId(null)
  }

  const handleAddModel = () => {
    if (!modelName.trim() || !modelValue.trim()) {
      toast.error("模型名称和值不能为空")
      return
    }

    // 检查是否已存在相同的模型值，防止重复添加
    const modelExists = models.some(model => 
      model.id !== editingModelId && (
        model.value.toLowerCase() === modelValue.trim().toLowerCase() || 
        model.name.toLowerCase() === modelName.trim().toLowerCase()
      )
    )

    if (modelExists) {
      toast.error("已存在相同名称或相同值的模型，请使用不同的名称或值")
      return
    }

    const newModel: CustomModel = {
      id: editingModelId || uuidv4(),
      name: modelName.trim(),
      value: modelValue.trim(),
      type: modelType,
      createdAt: new Date().toISOString()
    }

    if (editingModelId) {
      // 更新现有模型
      storage.updateCustomModel(editingModelId, newModel)
      setModels(prev => prev.map(model => model.id === editingModelId ? newModel : model))
      toast.success("模型已更新")
    } else {
      // 添加新模型
      storage.addCustomModel(newModel)
      setModels(prev => [...prev, newModel])
      toast.success("模型已添加")
    }

    resetForm()
  }

  const handleEditModel = (model: CustomModel) => {
    setModelName(model.name)
    setModelValue(model.value)
    setModelType(model.type)
    setEditingModelId(model.id)
  }

  const handleDeleteModel = (id: string) => {
    storage.removeCustomModel(id)
    setModels(prev => prev.filter(model => model.id !== id))
    toast.success("模型已删除")
  }

  const handleSelectModel = (model: CustomModel) => {
    if (onSelectModel) {
      onSelectModel(model.value, model.type)
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[98vw] max-h-[95vh] w-[98vw] sm:max-w-[800px]">
        <DialogHeader>
          <DialogTitle>自定义模型管理</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <h3 className="text-sm font-medium">添加/编辑模型</h3>
            <div className="grid gap-3">
              <div>
                <Input
                  placeholder="模型名称（显示在界面上）"
                  value={modelName}
                  onChange={(e) => setModelName(e.target.value)}
                />
              </div>
              <div>
                <Input
                  placeholder="模型值（实际API使用的值）"
                  value={modelValue}
                  onChange={(e) => setModelValue(e.target.value)}
                />
              </div>
              <div>
                <Select value={modelType} onValueChange={(value: ModelType) => setModelType(value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="选择模型类型" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ModelType.DALLE}>DALL-E 格式</SelectItem>
                    <SelectItem value={ModelType.OPENAI}>OpenAI 格式</SelectItem>
                    <SelectItem value={ModelType.GEMINI}>Gemini 格式</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-500 mt-1">
                  DALL-E格式：使用图像生成接口 | OpenAI格式：使用聊天接口 | Gemini格式：使用Gemini图像生成接口
                </p>
              </div>
              <Button onClick={handleAddModel}>
                {editingModelId ? '更新模型' : '添加模型'}
              </Button>
              {editingModelId && (
                <Button variant="ghost" onClick={resetForm}>
                  取消编辑
                </Button>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-medium">已保存的模型</h3>
            {models.length === 0 ? (
              <p className="text-sm text-gray-500">尚未添加自定义模型</p>
            ) : (
              <div className="space-y-2">
                {models.map((model) => (
                  <div key={model.id} className="border rounded-md p-3 flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{model.name}</p>
                      <p className="text-xs text-gray-500 truncate">{model.value}</p>
                      <p className="text-xs text-gray-500">
                        类型: {model.type === ModelType.DALLE ? 'DALL-E' : 'OpenAI'}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button size="icon" variant="ghost" onClick={() => handleSelectModel(model)}>
                        <Plus className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => handleEditModel(model)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => handleDeleteModel(model.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
} 
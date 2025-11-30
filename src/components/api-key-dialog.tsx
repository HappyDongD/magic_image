import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useState, useEffect } from "react"
import { storage } from "@/lib/storage"
import { Eye, EyeOff } from "lucide-react"
import { toast } from "sonner"

interface ApiKeyDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ApiKeyDialog({ open, onOpenChange }: ApiKeyDialogProps) {
  const [key, setKey] = useState("")
  const [baseUrl, setBaseUrl] = useState("")
  const [showKey, setShowKey] = useState(false)
  const [errors, setErrors] = useState<{ key?: string; baseUrl?: string }>({})

  useEffect(() => {
    const loadConfig = async () => {
      const config = await storage.getApiConfig()
      if (config) {
        setKey(config.key)
        setBaseUrl(config.baseUrl)
      }
    }

    loadConfig()
  }, [open])

  const validateInputs = () => {
    const newErrors: { key?: string; baseUrl?: string } = {}
    if (!key.trim()) {
      newErrors.key = "请输入 API Key"
    }
    if (!baseUrl.trim()) {
      newErrors.baseUrl = "请输入 API 基础地址"
    }
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSave = async () => {
    if (!validateInputs()) return
    
    // 确保使用 HTTPS 协议
    let secureUrl = baseUrl.trim()
    
    // 检查 URL 是否已结尾（特殊处理标记）
    const endsWithHash = secureUrl.endsWith('#')
    
    if (secureUrl.startsWith('http:') && !endsWithHash) {
      secureUrl = secureUrl.replace('http:', 'https:')
      toast.info("为确保安全，已自动将 HTTP 协议转换为 HTTPS")
    }
    
    await storage.setApiConfig(key.trim(), secureUrl)
    toast.success("保存成功")
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>API 配置</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <div>
              <Input
                placeholder="请输入 API 基础地址，如需使用完整 URL，请在末尾添加 # 符号"
                value={baseUrl}
                onChange={(e) => {
                  setBaseUrl(e.target.value)
                  setErrors(prev => ({ ...prev, baseUrl: undefined }))
                }}
                className={errors.baseUrl ? "border-red-500" : ""}
              />
              {errors.baseUrl && (
                <p className="text-sm text-red-500 mt-1">{errors.baseUrl}</p>
              )}
              <div className="flex flex-col gap-1 mt-1">
                <p className="text-xs text-amber-500">
                  注意：在 HTTPS 站点中使用 HTTP 接口可能会被浏览器阻止，建议使用 HTTPS 协议
                </p>
                <p className="text-xs text-gray-500">
                  默认添加 API 路径（如 /v1/chat/completions），若 URL 已结尾则使用完整输入地址
                </p>
              </div>
            </div>
            <div className="relative">
              <Input
                type={showKey ? "text" : "password"}
                placeholder="请输入您的 API Key"
                value={key}
                onChange={(e) => {
                  setKey(e.target.value)
                  setErrors(prev => ({ ...prev, key: undefined }))
                }}
                className={`pr-10 ${errors.key ? "border-red-500" : ""}`}
              />
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 h-full px-3"
                onClick={() => setShowKey(!showKey)}
              >
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
              {errors.key && (
                <p className="text-sm text-red-500 mt-1">{errors.key}</p>
              )}
            </div>
            <p className="text-xs text-gray-500">
              API 配置将安全地存储在您的浏览器中，不会上传到服务器
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button onClick={handleSave}>保存</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

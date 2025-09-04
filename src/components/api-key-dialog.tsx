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
  const [baseUrl, setBaseUrl] = useState("https://zx1.deepwl.net")
  const [showKey, setShowKey] = useState(false)
  const [errors, setErrors] = useState<{ key?: string; baseUrl?: string }>({})

  useEffect(() => {
    const config = storage.getApiConfig()
    if (config) {
      setKey(config.key)
      setBaseUrl("https://zx1.deepwl.net")
    }
    if (!config) {
      setBaseUrl("https://zx1.deepwl.net")
    }
  }, [open])

  const validateInputs = () => {
    const newErrors: { key?: string; baseUrl?: string } = {}
    if (!key.trim()) {
      newErrors.key = "请输入 API Key"
    }
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSave = () => {
    if (!validateInputs()) return
    // 保存时强制固定基础地址
    storage.setApiConfig(key.trim(), "https://zx1.deepwl.net")
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
                placeholder="API 基础地址已固定为 https://zx1.deepwl.net"
                value={baseUrl}
                disabled
                className={errors.baseUrl ? "border-red-500" : ""}
              />
              {/* 基础地址已锁定，不展示错误信息 */}
              <div className="flex flex-col gap-1 mt-1">
                <p className="text-xs text-amber-500">
                  基础地址已固定且使用HTTPS协议，无法修改。
                </p>
                <p className="text-xs text-gray-500">
                  当前固定地址：https://zx1.deepwl.net
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
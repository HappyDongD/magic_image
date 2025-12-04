import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
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
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>配置生图密钥</DialogTitle>
          <DialogDescription>
            配置AI模型的 BASE_URL 和 KEY，用于验证身份和计费。
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6 py-4">
          <Button
             className="w-full bg-[#FF6B00] hover:bg-[#e66000] text-white font-bold py-6 text-base shadow-lg shadow-orange-100"
             onClick={() => window.open('https://magic666.top', '_blank')}
          >
             👉 点击前往注册/获取密钥
          </Button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">或者手动配置</span>
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                BASE_URL (模型服务商网址)
              </label>
              <Input
                placeholder="https://magic666.top"
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
              <p className="text-[10px] text-gray-400">
                 例如: https://magic666.top 或其他服务商网址，注：末尾不要带 / 符号。
              </p>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                 API KEY (密钥)
              </label>
              <div className="relative">
                <Input
                  type={showKey ? "text" : "password"}
                  placeholder="sk-..."
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
              </div>
              {errors.key && (
                  <p className="text-sm text-red-500 mt-1">{errors.key}</p>
              )}
              <p className="text-[10px] text-gray-400">
                模型服务商的 API 密钥，仅存储在你的本地浏览器中。
              </p>
            </div>
          </div>
          
          <div className="flex justify-end gap-2 pt-2">
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

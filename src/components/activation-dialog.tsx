"use client"

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Copy, CheckCircle, Key } from 'lucide-react'
import { activationService } from '@/lib/activation-service'
import { toast } from 'sonner'

interface ActivationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ActivationDialog({ open, onOpenChange }: ActivationDialogProps) {
  const [activationCode, setActivationCode] = useState('')
  const [machineCode, setMachineCode] = useState('')
  const [isCopied, setIsCopied] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (open) {
      loadMachineCode()
    }
  }, [open])

  const loadMachineCode = async () => {
    try {
      const code = await activationService.getMachineCode()
      setMachineCode(code)
    } catch (error) {
      console.error('获取机器码失败:', error)
      toast.error('获取机器码失败')
    }
  }

  const handleCopyMachineCode = async () => {
    try {
      await navigator.clipboard.writeText(machineCode)
      setIsCopied(true)
      toast.success('机器码已复制到剪贴板')
      setTimeout(() => setIsCopied(false), 2000)
    } catch (error) {
      console.error('复制失败:', error)
      toast.error('复制失败，请手动复制')
    }
  }

  const handleActivate = async () => {
    if (!activationCode.trim()) {
      toast.error('请输入激活码')
      return
    }

    setIsLoading(true)
    try {
      const isValid = await activationService.verifyActivationCode(activationCode)
      if (isValid) {
        onOpenChange(false)
        setActivationCode('')
      }
    } catch (error) {
      console.error('激活失败:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const formatMachineCode = (code: string) => {
    if (code.length !== 16) return code
    return `${code.substring(0, 4)}-${code.substring(4, 8)}-${code.substring(8, 12)}-${code.substring(12, 16)}`
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            软件激活
          </DialogTitle>
          <DialogDescription>
            请输入激活码以解锁完整功能
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* 机器码显示 */}
          <div className="space-y-2">
            <Label htmlFor="machine-code">机器码</Label>
            <div className="flex items-center gap-2">
              <Input
                id="machine-code"
                value={formatMachineCode(machineCode)}
                readOnly
                className="font-mono"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={handleCopyMachineCode}
                disabled={!machineCode}
              >
                {isCopied ? <CheckCircle className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-gray-500">
              请将此机器码发送给管理员获取激活码
            </p>
          </div>

          {/* 激活码输入 */}
          <div className="space-y-2">
            <Label htmlFor="activation-code">激活码</Label>
            <Input
              id="activation-code"
              placeholder="例如：54AF-F35F-4856-3F53"
              value={activationCode}
              onChange={(e) => setActivationCode(e.target.value.toUpperCase())}
              className="font-mono uppercase"
            />
          </div>

          {/* 激活按钮 */}
          <Button
            onClick={handleActivate}
            disabled={isLoading || !activationCode.trim()}
            className="w-full"
          >
            {isLoading ? '验证中...' : '激活软件'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
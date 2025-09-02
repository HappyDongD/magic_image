"use client"

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Download, Settings } from 'lucide-react'
import { DownloadConfig } from '@/types'
import { storage } from '@/lib/storage'
import { toast } from 'sonner'

interface DownloadSettingsDialogProps {
  children?: React.ReactNode
}

export function DownloadSettingsDialog({ children }: DownloadSettingsDialogProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [config, setConfig] = useState<DownloadConfig>({
    autoDownload: false,
    defaultPath: '',
    organizeByDate: true,
    organizeByTask: true,
    filenameTemplate: '{task}_{index}_{timestamp}'
  })

  useEffect(() => {
    if (isOpen) {
      setConfig(storage.getDownloadConfig())
    }
  }, [isOpen])

  const handleSave = () => {
    storage.saveDownloadConfig(config)
    toast.success('下载设置已保存')
    setIsOpen(false)
  }

  const handleReset = () => {
    const defaultConfig: DownloadConfig = {
      autoDownload: false,
      defaultPath: '',
      organizeByDate: true,
      organizeByTask: true,
      filenameTemplate: '{task}_{index}_{timestamp}'
    }
    setConfig(defaultConfig)
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {children || (
          <Button variant="outline" size="sm">
            <Settings className="h-4 w-4 mr-1" />
            下载设置
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-6xl max-h-[90vh] w-[90vw]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Download className="h-6 w-6" />
            下载设置
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* 基本设置和文件组织 - 并排显示 */}
          <div className="grid grid-cols-1 2xl:grid-cols-2 gap-6">
            {/* 基本设置 */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">基本设置</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div className="space-y-1">
                    <Label htmlFor="autoDownload" className="text-base font-medium">自动下载</Label>
                    <p className="text-sm text-gray-600">批量任务完成后自动下载生成的所有图片</p>
                  </div>
                  <Switch
                    id="autoDownload"
                    checked={config.autoDownload}
                    onCheckedChange={(checked) => setConfig(prev => ({ ...prev, autoDownload: checked }))}
                  />
                </div>

                <div className="space-y-3">
                  <Label htmlFor="defaultPath" className="text-base font-medium">默认下载路径</Label>
                  <Input
                    id="defaultPath"
                    placeholder="留空使用浏览器默认下载路径"
                    value={config.defaultPath}
                    onChange={(e) => setConfig(prev => ({ ...prev, defaultPath: e.target.value }))}
                    className="h-10"
                  />
                  <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <p className="text-sm text-yellow-800">
                      <strong>注意：</strong>由于浏览器安全限制，实际下载路径由浏览器决定
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* 文件组织 */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">文件组织</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg">
                  <div className="space-y-1">
                    <Label htmlFor="organizeByDate" className="text-base font-medium">按日期组织</Label>
                    <p className="text-sm text-gray-600">将文件按生成日期组织到子文件夹中</p>
                  </div>
                  <Switch
                    id="organizeByDate"
                    checked={config.organizeByDate}
                    onCheckedChange={(checked) => setConfig(prev => ({ ...prev, organizeByDate: checked }))}
                  />
                </div>

                <div className="flex items-center justify-between p-4 bg-green-50 rounded-lg">
                  <div className="space-y-1">
                    <Label htmlFor="organizeByTask" className="text-base font-medium">按任务组织</Label>
                    <p className="text-sm text-gray-600">将文件按批量任务名称组织到子文件夹中</p>
                  </div>
                  <Switch
                    id="organizeByTask"
                    checked={config.organizeByTask}
                    onCheckedChange={(checked) => setConfig(prev => ({ ...prev, organizeByTask: checked }))}
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* 文件命名 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">文件命名</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-3">
                <Label htmlFor="filenameTemplate" className="text-base font-medium">文件名模板</Label>
                <Input
                  id="filenameTemplate"
                  value={config.filenameTemplate}
                  onChange={(e) => setConfig(prev => ({ ...prev, filenameTemplate: e.target.value }))}
                  className="h-10"
                />
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-700 mb-3 font-medium">可用变量：</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    <div className="flex items-center gap-2">
                      <code className="bg-white px-2 py-1 rounded border text-sm">{'{task}'}</code>
                      <span className="text-sm text-gray-600">任务名称</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <code className="bg-white px-2 py-1 rounded border text-sm">{'{index}'}</code>
                      <span className="text-sm text-gray-600">文件索引</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <code className="bg-white px-2 py-1 rounded border text-sm">{'{timestamp}'}</code>
                      <span className="text-sm text-gray-600">时间戳</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <code className="bg-white px-2 py-1 rounded border text-sm">{'{date}'}</code>
                      <span className="text-sm text-gray-600">日期</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <code className="bg-white px-2 py-1 rounded border text-sm">{'{taskId}'}</code>
                      <span className="text-sm text-gray-600">任务ID</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <Label className="text-base font-medium">预览示例</Label>
                <div className="bg-gray-100 p-4 rounded-lg text-sm font-mono border">
                  {config.filenameTemplate
                    .replace('{task}', 'my_batch_task')
                    .replace('{index}', '001')
                    .replace('{timestamp}', new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5))
                    .replace('{date}', new Date().toISOString().split('T')[0])
                    .replace('{taskId}', 'abc123')
                  }.png
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 快速模板 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">快速模板</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="max-h-24 overflow-y-auto border rounded-lg p-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setConfig(prev => ({ ...prev, filenameTemplate: '{task}_{index}' }))}
                  >
                    简单格式
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setConfig(prev => ({ ...prev, filenameTemplate: '{task}_{timestamp}' }))}
                  >
                    时间戳格式
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setConfig(prev => ({ ...prev, filenameTemplate: '{date}/{task}_{index}' }))}
                  >
                    日期分组
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setConfig(prev => ({ ...prev, filenameTemplate: '{taskId}_{index}_{timestamp}' }))}
                  >
                    完整信息
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setConfig(prev => ({ ...prev, filenameTemplate: '{task}_{date}_{index}' }))}
                  >
                    任务日期
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setConfig(prev => ({ ...prev, filenameTemplate: '{index}_{timestamp}' }))}
                  >
                    索引时间戳
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setConfig(prev => ({ ...prev, filenameTemplate: '{task}_{taskId}_{index}' }))}
                  >
                    任务ID格式
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setConfig(prev => ({ ...prev, filenameTemplate: '{date}_{task}_{index}_{timestamp}' }))}
                  >
                    完整格式
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex justify-between items-center pt-6 border-t mt-6">
          <Button variant="outline" onClick={handleReset} className="px-6">
            重置为默认
          </Button>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setIsOpen(false)} className="px-8">
              取消
            </Button>
            <Button onClick={handleSave} className="px-8">
              保存设置
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
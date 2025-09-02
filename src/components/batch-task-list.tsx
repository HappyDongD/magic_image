"use client"

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  Play,
  Pause,
  Trash2,
  Eye,
  Download,
  AlertCircle,
  CheckCircle,
  Clock,
  Loader2,
  Image as ImageIcon,
  MessageSquare,
  Settings,
  Edit,
  RefreshCcw
} from 'lucide-react'
import { BatchTask, BatchTaskStatus, TaskType, TaskResult, TaskItem, DebugLog } from '@/types'
import { batchTaskManager } from '@/lib/batch-task-manager'
import { toast } from 'sonner'
import { fileDownloadManager } from '@/lib/file-download-manager'
import { storage } from '@/lib/storage'
import { readLocalFile } from '@/lib/local-file'

interface BatchTaskListProps {
  tasks: BatchTask[]
  onTaskUpdate: (taskId: string, updates: Partial<BatchTask>) => void
  onTaskDelete: (taskId: string) => void
  onTaskEdit?: (task: BatchTask) => void
}

export function BatchTaskList({ tasks, onTaskUpdate, onTaskDelete, onTaskEdit }: BatchTaskListProps) {
  const [selectedTask, setSelectedTask] = useState<BatchTask | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [previewImage, setPreviewImage] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const [dlProgress, setDlProgress] = useState<Record<string, { progress: number; bytesPerSec: number }>>({})
  const [manualDownloading, setManualDownloading] = useState<Set<string>>(new Set())
  const [debugLogItem, setDebugLogItem] = useState<TaskItem | null>(null)
  const [isDebugLogOpen, setIsDebugLogOpen] = useState(false)
  const [localImageCache, setLocalImageCache] = useState<Record<string, string>>({})

  useEffect(() => {
    const timer = setInterval(() => setTick(t => (t + 1) % 1_000_000), 1000)
    return () => clearInterval(timer)
  }, [])

  // 预加载本地图片
  useEffect(() => {
    if (selectedTask && selectedTask.results.length > 0) {
      selectedTask.results.forEach(result => {
        if (result.localPath && !localImageCache[result.localPath]) {
          readLocalFile(result.localPath).then(dataUrl => {
            setLocalImageCache(prev => ({ ...prev, [result.localPath!]: dataUrl }))
          }).catch(error => {
            console.error('Failed to load local image:', result.localPath, error)
          })
        }
      })
    }
  }, [selectedTask, localImageCache])

  useEffect(() => {
    ;(async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event')
        const unlisten1 = await listen('download:progress', (e: any) => {
          const p = e?.payload || {}
          const url = String(p.url || '')
          if (!url) return
          
          const downloaded = Number(p.downloaded || 0)
          const total = Number(p.total || 0)
          const bytesPerSec = Number(p.bytesPerSec || 0)
          const progress = total > 0 ? Math.min(1, downloaded / total) : 0
          
          setDlProgress(prev => ({
            ...prev,
            [url]: {
              progress,
              bytesPerSec
            }
          }))
          
          // 如果下载完成，5秒后清理进度状态
          if (progress >= 1) {
            setTimeout(() => {
              setDlProgress(prev => {
                const newState = { ...prev }
                delete newState[url]
                return newState
              })
              // 清理手动下载状态
              setManualDownloading(prev => {
                const newSet = new Set(prev)
                newSet.delete(url)
                return newSet
              })
            }, 5000)
          }
        })
        const unlisten2 = await listen('download:error', (e: any) => {
          const p = e?.payload || {}
          const url = String(p.url || '')
          if (!url) return
          
          console.error('Download error:', p.error)
          
          // 清理进度状态
          setDlProgress(prev => {
            const newState = { ...prev }
            delete newState[url]
            return newState
          })
          
          // 清理手动下载状态
          setManualDownloading(prev => {
            const newSet = new Set(prev)
            newSet.delete(url)
            return newSet
          })
        })
        
        return () => {
          // @ts-ignore
          unlisten1 && unlisten1()
          // @ts-ignore
          unlisten2 && unlisten2()
        }
      } catch {}
    })()
  }, [])

  const fmtSpeed = (bps: number) => {
    if (!bps || bps <= 0) return ''
    const kb = bps / 1024
    if (kb < 1024) return `${kb.toFixed(1)} KB/s`
    const mb = kb / 1024
    return `${mb.toFixed(2)} MB/s`
  }

  const getStatusIcon = (status: BatchTaskStatus) => {
    switch (status) {
      case BatchTaskStatus.PENDING:
        return <Clock className="h-4 w-4 text-yellow-500" />
      case BatchTaskStatus.PROCESSING:
        return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />
      case BatchTaskStatus.COMPLETED:
        return <CheckCircle className="h-4 w-4 text-green-500" />
      case BatchTaskStatus.FAILED:
        return <AlertCircle className="h-4 w-4 text-red-500" />
      case BatchTaskStatus.CANCELLED:
        return <Pause className="h-4 w-4 text-gray-500" />
      default:
        return <Clock className="h-4 w-4 text-gray-500" />
    }
  }

  const getStatusBadge = (status: BatchTaskStatus) => {
    const variants = {
      [BatchTaskStatus.PENDING]: 'secondary',
      [BatchTaskStatus.PROCESSING]: 'default',
      [BatchTaskStatus.COMPLETED]: 'default',
      [BatchTaskStatus.FAILED]: 'destructive',
      [BatchTaskStatus.CANCELLED]: 'outline'
    } as const

    const labels = {
      [BatchTaskStatus.PENDING]: '等待中',
      [BatchTaskStatus.PROCESSING]: '处理中',
      [BatchTaskStatus.COMPLETED]: '已完成',
      [BatchTaskStatus.FAILED]: '失败',
      [BatchTaskStatus.CANCELLED]: '已取消'
    }

    return (
      <Badge variant={variants[status]}>
        {getStatusIcon(status)}
        <span className="ml-1">{labels[status]}</span>
      </Badge>
    )
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

  const handleStartTask = async (taskId: string) => {
    try {
      console.log('开始执行任务:', taskId)
      await batchTaskManager.startTask(taskId)
      toast.success('任务已开始执行')
    } catch (error) {
      console.error('启动任务失败:', error)
      toast.error(`启动任务失败: ${error instanceof Error ? error.message : '未知错误'}`)
    }
  }

  const handleStopTask = (taskId: string) => {
    batchTaskManager.stopTask(taskId)
    toast.success('任务已停止')
  }

  const handleDeleteTask = (taskId: string) => {
    if (confirm('确定要删除这个批量任务吗？')) {
      batchTaskManager.deleteTask(taskId)
      onTaskDelete(taskId)
      toast.success('任务已删除')
    }
  }

  const handleViewTask = (task: BatchTask) => {
    setSelectedTask(task)
    setIsDialogOpen(true)
  }

  const handleDownloadResults = async (task: BatchTask) => {
    const downloadableResults = task.results.filter(r => r.imageUrl && !r.downloaded)

    if (downloadableResults.length === 0) {
      toast.info('没有可下载的图片')
      return
    }

    for (const result of downloadableResults) {
      try {
        const response = await fetch(result.imageUrl)
        const blob = await response.blob()
        const url = URL.createObjectURL(blob)

        const a = document.createElement('a')
        a.href = url
        a.download = `task_${task.name}_${result.id}.png`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)

        URL.revokeObjectURL(url)
        result.downloaded = true
      } catch (error) {
        console.error('下载失败:', error)
      }
    }

    toast.success(`已下载 ${downloadableResults.length} 张图片`)
  }

  const handleDownloadSingle = async (url: string, filename: string, taskItemId?: string) => {
    // 立即设置下载状态
    setManualDownloading(prev => new Set(prev).add(url))
    
    // 找到对应的TaskResult
    const tasks = storage.getBatchTasks()
    let targetResult: TaskResult | null = null
    let targetTaskName = ''
    
    for (const task of tasks) {
      const result = task.results.find(r => r.imageUrl === url)
      if (result) {
        targetResult = result
        targetTaskName = task.name
        break
      }
    }
    
    if (targetResult) {
      fileDownloadManager.addDownload(targetResult, targetTaskName)
    } else {
      console.error('Failed to find TaskResult for URL:', url)
      // 下载失败，移除下载状态
      setManualDownloading(prev => {
        const newSet = new Set(prev)
        newSet.delete(url)
        return newSet
      })
    }
  }

  const handleRetryFailed = (taskId: string) => {
    batchTaskManager.retryFailedItems(taskId)
    toast.success('已重试失败任务')
  }

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString('zh-CN')
  }

  const formatDuration = (start: string, end?: string) => {
    const startTime = new Date(start).getTime()
    const endTime = end ? new Date(end).getTime() : Date.now()
    let duration = Math.max(0, Math.floor((endTime - startTime) / 1000))

    if (duration < 60) return `${duration}秒`
    if (duration < 3600) return `${Math.floor(duration / 60)}分钟`
    return `${Math.floor(duration / 3600)}小时${Math.floor((duration % 3600) / 60)}分钟`
  }

  return (
    <>
      <div className="space-y-4">
        {tasks.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <ImageIcon className="h-12 w-12 text-gray-400 mb-4" />
              <p className="text-gray-500 text-center">暂无批量任务</p>
              <p className="text-sm text-gray-400 text-center mt-2">
                点击上方按钮创建新的批量任务
              </p>
            </CardContent>
          </Card>
        ) : (
          tasks.map((task) => (
            <Card key={task.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {getTaskTypeIcon(task.type)}
                    <div>
                      <h3 className="font-medium text-lg">{task.name}</h3>
                      <p className="text-sm text-gray-500">
                        创建时间: {formatDateTime(task.createdAt)}
                        {task.startedAt && (
                          <span className="ml-3">运行时间: {formatDuration(task.startedAt, task.completedAt)}</span>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {getStatusBadge(task.status)}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleViewTask(task)}
                    >
                      <Eye className="h-4 w-4 mr-1" />
                      查看
                    </Button>
                  </div>
                </div>
                <div className="mt-2 text-xs text-gray-500">
                  下载目录: {storage.getDownloadConfig().defaultPath || '未设置（使用浏览器默认）'}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-gray-500">总任务数</p>
                    <p className="font-medium">{task.totalItems}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">已完成</p>
                    <p className="font-medium text-green-600">{task.completedItems}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">失败</p>
                    <p className="font-medium text-red-600">{task.failedItems}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">模型</p>
                    <p className="font-medium">{task.config.model}</p>
                  </div>
                </div>
                {task.status === BatchTaskStatus.COMPLETED && task.results.length > 0 && (
                  <div className="text-xs text-gray-500">总耗时: {Math.round(task.results.reduce((s, r) => s + (r.durationMs || 0), 0) / 1000)} 秒</div>
                )}

                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>进度</span>
                    <span>{task.progress}%</span>
                  </div>
                  <Progress value={task.progress} className="h-2" />
                </div>

                {task.status === BatchTaskStatus.PROCESSING && task.startedAt && (
                  <div className="text-sm text-gray-500">
                    运行时间: {formatDuration(task.startedAt)}
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  {task.status === BatchTaskStatus.PENDING && (
                    <Button
                      size="sm"
                      onClick={() => handleStartTask(task.id)}
                      className="flex-1"
                    >
                      <Play className="h-4 w-4 mr-1" />
                      开始
                    </Button>
                  )}

                  {task.status === BatchTaskStatus.PROCESSING && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleStopTask(task.id)}
                      className="flex-1"
                    >
                      <Pause className="h-4 w-4 mr-1" />
                      停止
                    </Button>
                  )}

                  {task.failedItems > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleRetryFailed(task.id)}
                      className="flex-1"
                    >
                      <RefreshCcw className="h-4 w-4 mr-1" />
                      重试失败
                    </Button>
                  )}

                  {task.results.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDownloadResults(task)}
                    >
                      <Download className="h-4 w-4 mr-1" />
                      下载结果
                    </Button>
                  )}

                  {task.status === BatchTaskStatus.PENDING && onTaskEdit && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onTaskEdit(task)}
                    >
                      <Edit className="h-4 w-4 mr-1" />
                      编辑
                    </Button>
                  )}

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDeleteTask(task.id)}
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    删除
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* 任务详情对话框 */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-[98vw] max-h-[95vh] w-[98vw]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedTask && getTaskTypeIcon(selectedTask.type)}
              {selectedTask?.name}
            </DialogTitle>
          </DialogHeader>

          {selectedTask && (
            <ScrollArea className="max-h-[60vh]">
              <div className="space-y-6">
                {/* 任务概览 */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-gray-50 p-3 rounded-lg">
                    <p className="text-sm text-gray-500">状态</p>
                    <div className="mt-1">{getStatusBadge(selectedTask.status)}</div>
                  </div>
                  <div className="bg-gray-50 p-3 rounded-lg">
                    <p className="text-sm text-gray-500">总任务数</p>
                    <p className="text-lg font-medium">{selectedTask.totalItems}</p>
                  </div>
                  <div className="bg-gray-50 p-3 rounded-lg">
                    <p className="text-sm text-gray-500">已完成</p>
                    <p className="text-lg font-medium text-green-600">{selectedTask.completedItems}</p>
                  </div>
                  <div className="bg-gray-50 p-3 rounded-lg">
                    <p className="text-sm text-gray-500">失败</p>
                    <p className="text-lg font-medium text-red-600">{selectedTask.failedItems}</p>
                  </div>
                </div>

                {/* API 调用统计 */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-gray-50 p-3 rounded-lg">
                    <p className="text-sm text-gray-500">API 调用总数</p>
                    <p className="text-lg font-medium">
                      {selectedTask.items.reduce((sum, item) => sum + (item.attemptCount || 0), 0)}
                    </p>
                  </div>
                  <div className="bg-green-50 p-3 rounded-lg">
                    <p className="text-sm text-gray-600">成功调用</p>
                    <p className="text-lg font-medium text-green-700">{selectedTask.completedItems}</p>
                  </div>
                  <div className="bg-red-50 p-3 rounded-lg">
                    <p className="text-sm text-gray-600">失败调用</p>
                    <p className="text-lg font-medium text-red-700">{selectedTask.failedItems}</p>
                  </div>
                </div>

                {/* 任务配置 */}
                <div>
                  <h4 className="font-medium mb-3">任务配置</h4>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                    <div>
                      <p className="text-gray-500">模型</p>
                      <p className="font-medium">{selectedTask.config.model}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">图片比例</p>
                      <p className="font-medium">{selectedTask.config.aspectRatio}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">图片尺寸</p>
                      <p className="font-medium">{selectedTask.config.size}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">并发数量</p>
                      <p className="font-medium">{selectedTask.config.concurrentLimit}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">重试次数</p>
                      <p className="font-medium">{selectedTask.config.retryAttempts}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">自动下载</p>
                      <p className="font-medium">{selectedTask.config.autoDownload ? '是' : '否'}</p>
                    </div>
                  </div>
                </div>

                {/* 任务项列表 */}
                {selectedTask.items.length > 0 && (
                  <div>
                    <h4 className="font-medium mb-3">任务项 ({selectedTask.items.length})</h4>
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {selectedTask.items.slice(0, 10).map((item) => (
                        <div key={item.id} className="border rounded-lg p-3">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              {getStatusIcon(item.status)}
                              <span className="text-sm font-medium">任务 #{item.id.slice(-6)}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant={item.status === BatchTaskStatus.COMPLETED ? 'default' : item.status === BatchTaskStatus.FAILED ? 'destructive' : 'secondary'}>
                                {item.status === BatchTaskStatus.COMPLETED ? '完成' :
                                 item.status === BatchTaskStatus.FAILED ? '失败' :
                                 item.status === BatchTaskStatus.PROCESSING ? '处理中' : '等待中'}
                              </Badge>
                              {item.debugLogs && item.debugLogs.length > 0 && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 px-2 text-xs"
                                  onClick={() => {
                                    setDebugLogItem(item)
                                    setIsDebugLogOpen(true)
                                  }}
                                >
                                  查看调试
                                </Button>
                              )}
                            </div>
                          </div>
                          <p className="text-sm text-gray-600 line-clamp-2">{item.prompt}</p>
                          {item.error && (
                            <p className="text-sm text-red-500 mt-1">错误: {item.error}</p>
                          )}
                        </div>
                      ))}
                      {selectedTask.items.length > 10 && (
                        <p className="text-sm text-gray-500 text-center py-2">
                          ... 还有 {selectedTask.items.length - 10} 个任务项
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* 生成结果 */}
                {selectedTask.results.length > 0 && (
                  <div>
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
                      <h4 className="font-medium">生成结果 ({selectedTask.results.length})</h4>
                      <div className="flex flex-wrap gap-2">
                        {/* API重试 - 重新生成失败的任务 */}
                        {selectedTask.failedItems > 0 && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              handleRetryFailed(selectedTask.id)
                            }}
                          >
                            <RefreshCcw className="h-3 w-3 mr-1" />
                            重试API失败
                          </Button>
                        )}
                        
                        {/* 下载重试 - 重新下载失败的任务 */}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            fileDownloadManager.retryFailedDownloads(selectedTask.id)
                          }}
                        >
                          <Download className="h-3 w-3 mr-1" />
                          重试下载失败
                        </Button>
                        
                        {/* 重新下载全部 */}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            fileDownloadManager.retryAllDownloads()
                          }}
                        >
                          <Download className="h-3 w-3 mr-1" />
                          重新下载全部
                        </Button>
                      </div>
                    </div>
                    <div className="max-h-80 overflow-y-auto pl-2">
                      <div className="grid grid-cols-8 md:grid-cols-12 gap-2">
                        {selectedTask.results.map((result) => {
                          const prog = dlProgress[result.imageUrl]
                          const progress = prog?.progress ?? (result.downloaded ? 1 : 0)
                          const isDownloading = manualDownloading.has(result.imageUrl) || (prog !== undefined && progress < 1)
                          const hasLocalPath = result.localPath && result.localPath.length > 0
                          
                          return (
                            <div
                              key={result.id}
                              className="group relative w-20 h-20 md:w-24 md:h-24 rounded-md overflow-hidden ring-1 ring-gray-200"
                              onDoubleClick={() => {
  if (hasLocalPath) {
    // 优先使用缓存，如果没有则读取文件
    if (localImageCache[result.localPath!]) {
      setPreviewImage(localImageCache[result.localPath!])
    } else {
      // 异步读取文件
      readLocalFile(result.localPath!).then(dataUrl => {
        setLocalImageCache(prev => ({ ...prev, [result.localPath!]: dataUrl }))
        setPreviewImage(dataUrl)
      }).catch(() => {
        // 如果读取失败，回退到网络图片
        setPreviewImage(result.imageUrl)
      })
    }
  } else {
    setPreviewImage(result.imageUrl)
  }
}}
                            >
                              {hasLocalPath ? (
                                localImageCache[result.localPath!] ? (
                                  <img 
                                    src={localImageCache[result.localPath!]} 
                                    alt="生成结果" 
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <div className="w-full h-full bg-gray-100 flex items-center justify-center">
                                    <div className="text-center">
                                      <Loader2 className="h-6 w-6 animate-spin mx-auto mb-1 text-gray-400" />
                                      <span className="text-xs text-gray-500">加载中...</span>
                                    </div>
                                  </div>
                                )
                              ) : (
                                <Image 
                                  src={result.imageUrl} 
                                  alt="生成结果" 
                                  fill 
                                  className="object-cover"
                                  onError={(e) => {
                                    console.error('Failed to load remote image:', result.imageUrl)
                                    const img = e.target as HTMLImageElement
                                    img.style.display = 'none'
                                    const parent = img.parentElement
                                    if (parent) {
                                      const fallback = document.createElement('div')
                                      fallback.className = 'w-full h-full bg-gray-200 flex items-center justify-center text-gray-400 text-xs'
                                      fallback.textContent = '加载失败'
                                      parent.appendChild(fallback)
                                    }
                                  }}
                                />
                              )}

                              {/* 下载进度遮罩：自上而下露出 */}
                              {isDownloading && (
                                <div className="absolute inset-0 pointer-events-none">
                                  <div
                                    className="absolute top-0 left-0 right-0 bg-black/50 transition-all duration-150 ease-linear"
                                    style={{ height: `${Math.max(0, 100 - Math.floor(progress * 100))}%` }}
                                  />
                                  <div className="absolute bottom-0 left-0 right-0 text-[10px] text-white bg-black/60 px-1 py-[2px] flex items-center justify-between backdrop-blur-sm">
                                    <span className="font-medium">{Math.floor(progress * 100)}%</span>
                                    <span>{fmtSpeed(prog?.bytesPerSec || 0)}</span>
                                  </div>
                                </div>
                              )}

                              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                              <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-[10px] text-white px-1 py-[2px] flex items-center justify-between">
                                <span className="truncate">{result.id.slice(-6)}{result.durationMs ? ` · ${result.durationMs}ms` : ''}</span>
                                {result.downloaded && (
                                  <CheckCircle className="h-3 w-3 text-green-400" />
                                )}
                                {!result.downloaded && manualDownloading.has(result.id) && (
                                  <Loader2 className="h-3 w-3 text-yellow-400 animate-spin" />
                                )}
                                {!result.downloaded && !manualDownloading.has(result.id) && result.localPath && (
                                  <AlertCircle className="h-3 w-3 text-red-400" />
                                )}
                              </div>
                              {/* 下载按钮 */}
                          {!isDownloading ? (
                            <button
                              className={`absolute top-1 right-1 flex items-center justify-center w-6 h-6 rounded-full shadow backdrop-blur-sm ${
                                result.downloaded 
                                  ? 'bg-green-500/80 hover:bg-green-500 text-white' 
                                  : 'bg-red-500/80 hover:bg-red-500 text-white'
                              }`}
                              onClick={(e) => {
                                e.stopPropagation()
                                handleDownloadSingle(result.imageUrl, `result_${result.id}.png`, result.taskItemId)
                              }}
                              title={result.downloaded ? "重新下载" : "重试下载"}
                            >
                              {result.downloaded ? (
                                <Download className="h-3 w-3" />
                              ) : (
                                <RefreshCcw className="h-3 w-3" />
                              )}
                            </button>
                          ) : (
                            <div className="absolute top-1 right-1 flex items-center justify-center w-6 h-6 rounded-full shadow bg-yellow-500/80 text-white backdrop-blur-sm">
                              <Loader2 className="h-3 w-3 animate-spin" />
                            </div>
                          )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
      {previewImage && (
        <Dialog open={!!previewImage} onOpenChange={() => setPreviewImage(null)}>
          <DialogContent className="max-w-3xl max-h-[80vh]">
            <div className="relative w-full max-h-[70vh] aspect-[4/3] p-2">
              <Image src={previewImage} alt="预览" fill className="object-contain" />
            </div>
          </DialogContent>
        </Dialog>
      )}
      
      {/* 调试日志对话框 */}
      {debugLogItem && (
        <Dialog open={isDebugLogOpen} onOpenChange={setIsDebugLogOpen}>
          <DialogContent className="max-w-4xl max-h-[80vh]">
            <DialogHeader>
              <DialogTitle>调试日志 - 任务 #{debugLogItem.id.slice(-6)}</DialogTitle>
            </DialogHeader>
            <ScrollArea className="max-h-[60vh]">
              <div className="space-y-4">
                {debugLogItem.debugLogs?.map((log) => (
                  <div key={log.id} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {log.type === 'request' && <MessageSquare className="h-4 w-4 text-blue-500" />}
                        {log.type === 'response' && <CheckCircle className="h-4 w-4 text-green-500" />}
                        {log.type === 'error' && <AlertCircle className="h-4 w-4 text-red-500" />}
                        <span className="text-sm font-medium">
                          {log.type === 'request' && '请求'}
                          {log.type === 'response' && '响应'}
                          {log.type === 'error' && '错误'}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500">
                        {new Date(log.timestamp).toLocaleString()}
                        {log.duration && ` · ${log.duration}ms`}
                      </div>
                    </div>
                    <pre className="text-xs bg-gray-50 p-3 rounded overflow-x-auto">
                      {JSON.stringify(log.data, null, 2)}
                    </pre>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}
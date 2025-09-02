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
  Edit
} from 'lucide-react'
import { BatchTask, BatchTaskStatus, TaskType } from '@/types'
import { batchTaskManager } from '@/lib/batch-task-manager'
import { toast } from 'sonner'

interface BatchTaskListProps {
  tasks: BatchTask[]
  onTaskUpdate: (taskId: string, updates: Partial<BatchTask>) => void
  onTaskDelete: (taskId: string) => void
  onTaskEdit?: (task: BatchTask) => void
}

export function BatchTaskList({ tasks, onTaskUpdate, onTaskDelete, onTaskEdit }: BatchTaskListProps) {
  const [selectedTask, setSelectedTask] = useState<BatchTask | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)

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

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString('zh-CN')
  }

  const formatDuration = (start: string, end?: string) => {
    const startTime = new Date(start).getTime()
    const endTime = end ? new Date(end).getTime() : Date.now()
    const duration = Math.floor((endTime - startTime) / 1000)

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
                            <Badge variant={item.status === BatchTaskStatus.COMPLETED ? 'default' : item.status === BatchTaskStatus.FAILED ? 'destructive' : 'secondary'}>
                              {item.status === BatchTaskStatus.COMPLETED ? '完成' :
                               item.status === BatchTaskStatus.FAILED ? '失败' :
                               item.status === BatchTaskStatus.PROCESSING ? '处理中' : '等待中'}
                            </Badge>
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
                    <h4 className="font-medium mb-3">生成结果 ({selectedTask.results.length})</h4>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                      {selectedTask.results.map((result) => (
                        <div key={result.id} className="border rounded-lg overflow-hidden">
                          <div className="relative w-full h-24">
                            <Image
                              src={result.imageUrl}
                              alt="生成结果"
                              fill
                              className="object-cover"
                            />
                          </div>
                          <div className="p-2">
                            <p className="text-xs text-gray-500 truncate">
                              {result.id.slice(-8)}
                            </p>
                            {result.downloaded && (
                              <Badge variant="outline" className="text-xs mt-1">
                                已下载
                              </Badge>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Play,
  Pause,
  Square,
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
  RefreshCcw,
} from 'lucide-react';
import {
  BatchTask,
  BatchTaskStatus,
  TaskType,
  TaskResult,
  TaskItem,
  DebugLog,
} from '@/types';
import { batchTaskManager } from '@/lib/batch-task-manager';
import { toast } from 'sonner';
import { downloadService } from '@/lib/download-service';
import { storage } from '@/lib/sqlite-storage';
import { TaskDetailDialog } from '@/components/task-detail-dialog';

// 本地图片组件 - 使用Tauri convertFileSrc
function LocalImage({
  localPath,
  fallbackUrl,
}: {
  localPath: string;
  fallbackUrl: string;
}) {
  console.log(`🖼️ 本地图片路径: ${localPath}`);

  // 尝试使用Tauri的convertFileSrc
  let tauriUrl = '';
  try {
    if (typeof window !== 'undefined' && (window as any).__TAURI__) {
      const { convertFileSrc } = require('@tauri-apps/api/core');
      tauriUrl = convertFileSrc(localPath);
      console.log(`🔗 Tauri转换后的URL: ${tauriUrl}`);
    }
  } catch (error) {
    console.log('Tauri convertFileSrc 不可用:', error);
  }

  // 如果Tauri转换成功，使用转换后的URL，否则回退到网络图片
  const imageSrc = tauriUrl || fallbackUrl;

  return (
    <img
      src={imageSrc}
      alt="生成结果"
      className="w-full h-full object-cover"
      onError={e => {
        console.error('本地图片加载失败，回退到网络图片:', localPath);
        const img = e.target as HTMLImageElement;
        img.src = fallbackUrl;
      }}
      onLoad={() => {
        console.log('本地图片加载成功:', localPath);
      }}
    />
  );
}

interface BatchTaskListProps {
  tasks: BatchTask[];
  onTaskUpdate: (taskId: string, updates: Partial<BatchTask>) => void;
  onTaskDelete: (taskId: string) => void;
  onTaskEdit?: (task: BatchTask) => void;
}

export function BatchTaskList({
  tasks,
  onTaskUpdate,
  onTaskDelete,
  onTaskEdit,
}: BatchTaskListProps) {
  const [selectedTask, setSelectedTask] = useState<BatchTask | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [dlProgress, setDlProgress] = useState<
    Record<string, { progress: number; bytesPerSec: number }>
  >({});
  const [manualDownloading, setManualDownloading] = useState<Set<string>>(
    new Set()
  );
  const [debugLogItem, setDebugLogItem] = useState<TaskItem | null>(null);
  const [isDebugLogOpen, setIsDebugLogOpen] = useState(false);
  const [pendingDeleteTaskId, setPendingDeleteTaskId] = useState<string | null>(
    null
  );
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      const startTime = performance.now();
      setTick(t => (t + 1) % 1_000_000);
      const endTime = performance.now();
      if (endTime - startTime > 16) {
        console.warn('⏱️ setTick 耗时过长:', endTime - startTime, 'ms');
      }
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // 监听任务更新事件
  useEffect(() => {
    const unsubscribeCallbacks: (() => void)[] = [];

    tasks.forEach(task => {
      const unsubscribe = batchTaskManager.onTaskUpdate(
        task.id,
        updatedTask => {
          // 强制重新渲染组件，但添加性能监控
          const startTime = performance.now();
          setTick(t => (t + 1) % 1_000_000);
          const endTime = performance.now();
          if (endTime - startTime > 16) {
            console.warn(
              '⏱️ 任务更新导致重渲染耗时过长:',
              endTime - startTime,
              'ms'
            );
          }
        }
      );
      unsubscribeCallbacks.push(unsubscribe);
    });

    return () => {
      unsubscribeCallbacks.forEach(unsubscribe => unsubscribe());
    };
  }, [tasks]);

  // 打开内置删除确认对话框
  const openDeleteConfirm = (taskId: string) => {
    console.log('[UI] delete clicked', { taskId });
    setPendingDeleteTaskId(taskId);
    setIsDeleteConfirmOpen(true);
  };

  useEffect(() => {
    (async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        const unlisten1 = await listen('download:progress', (e: any) => {
          const startTime = performance.now();
          const p = e?.payload || {};
          const url = String(p.url || '');
          if (!url) return;

          const downloaded = Number(p.downloaded || 0);
          const total = Number(p.total || 0);
          const bytesPerSec = Number(p.bytesPerSec || 0);
          const progress = total > 0 ? Math.min(1, downloaded / total) : 0;

          setDlProgress(prev => {
            const newState = { ...prev, [url]: { progress, bytesPerSec } };
            return newState;
          });

          // 如果下载完成，5秒后清理进度状态
          if (progress >= 1) {
            setTimeout(() => {
              setDlProgress(prev => {
                const newState = { ...prev };
                delete newState[url];
                return newState;
              });
              // 清理手动下载状态
              setManualDownloading(prev => {
                const newSet = new Set(prev);
                newSet.delete(url);
                return newSet;
              });
            }, 5000);
          }

          const endTime = performance.now();
          if (endTime - startTime > 16) {
            console.warn(
              '⏱️ 下载进度更新耗时过长:',
              endTime - startTime,
              'ms',
              { url }
            );
          }
        });
        const unlisten2 = await listen('download:error', (e: any) => {
          const startTime = performance.now();
          const p = e?.payload || {};
          const url = String(p.url || '');
          if (!url) return;

          console.error('Download error:', p.error);

          // 清理进度状态
          setDlProgress(prev => {
            const newState = { ...prev };
            delete newState[url];
            return newState;
          });

          // 清理手动下载状态
          setManualDownloading(prev => {
            const newSet = new Set(prev);
            newSet.delete(url);
            return newSet;
          });

          const endTime = performance.now();
          if (endTime - startTime > 16) {
            console.warn(
              '⏱️ 下载错误处理耗时过长:',
              endTime - startTime,
              'ms',
              { url }
            );
          }
        });

        return () => {
          // @ts-ignore
          unlisten1 && unlisten1();
          // @ts-ignore
          unlisten2 && unlisten2();
        };
      } catch {}
    })();
  }, []);

  // 监听前端自定义事件（用于非 Tauri 回退或即时反馈）
  useEffect(() => {
    const onEnqueued = (e: any) => {
      const url = e?.detail?.url as string | undefined;
      if (!url) return;
      setManualDownloading(prev => new Set(prev).add(url));
    };
    const onDone = (e: any) => {
      const url = e?.detail?.url as string | undefined;
      if (!url) return;
      setDlProgress(prev => {
        const next = { ...prev };
        delete next[url];
        return next;
      });
      setManualDownloading(prev => {
        const next = new Set(prev);
        next.delete(url);
        return next;
      });
    };
    const onError = (e: any) => {
      const url = e?.detail?.url as string | undefined;
      if (!url) return;
      setDlProgress(prev => {
        const next = { ...prev };
        delete next[url];
        return next;
      });
      setManualDownloading(prev => {
        const next = new Set(prev);
        next.delete(url);
        return next;
      });
    };

    // 监听下载完成事件，刷新任务数据
    const onDownloadComplete = (e: any) => {
      const { taskId, resultId, localPath, imageUrl } = e?.detail || {};
      console.log('🎉 收到下载完成事件:', {
        taskId,
        resultId,
        localPath,
        imageUrl,
      });

      if (taskId && selectedTask && selectedTask.id === taskId) {
        // 更新当前选中的任务数据
        const updatedTask = { ...selectedTask };
        const result = updatedTask.results.find(r => r.id === resultId);
        if (result) {
          result.localPath = localPath;
          result.downloaded = true;
          console.log('🔄 更新任务结果本地路径:', { resultId, localPath });

          // 重新加载任务数据
          const task = batchTaskManager?.getTask(taskId);
          if (task) {
            console.log('📥 重新加载任务数据:', task);
            // 这里需要触发父组件重新获取任务数据
            // 由于这是子组件，我们需要通过回调通知父组件
            if (onTaskUpdate) {
              onTaskUpdate(taskId, task);
            }
          }
        }
      }
    };

    window.addEventListener('download:enqueued' as any, onEnqueued as any);
    window.addEventListener('download:done' as any, onDone as any);
    window.addEventListener('download:error' as any, onError as any);
    window.addEventListener(
      'download:complete' as any,
      onDownloadComplete as any
    );
    return () => {
      window.removeEventListener('download:enqueued' as any, onEnqueued as any);
      window.removeEventListener('download:done' as any, onDone as any);
      window.removeEventListener('download:error' as any, onError as any);
      window.removeEventListener(
        'download:complete' as any,
        onDownloadComplete as any
      );
    };
  }, []);

  const fmtSpeed = (bps: number) => {
    if (!bps || bps <= 0) return '';
    const kb = bps / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB/s`;
    const mb = kb / 1024;
    return `${mb.toFixed(2)} MB/s`;
  };

  const getStatusIcon = (status: BatchTaskStatus) => {
    switch (status) {
      case BatchTaskStatus.PENDING:
        return <Clock className="h-4 w-4 text-yellow-500" />;
      case BatchTaskStatus.PROCESSING:
        return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
      case BatchTaskStatus.PAUSED:
        return <Pause className="h-4 w-4 text-orange-500" />;
      case BatchTaskStatus.COMPLETED:
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case BatchTaskStatus.FAILED:
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      case BatchTaskStatus.CANCELLED:
        return <Square className="h-4 w-4 text-gray-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusBadge = (status: BatchTaskStatus) => {
    const variants = {
      [BatchTaskStatus.PENDING]: 'secondary',
      [BatchTaskStatus.PROCESSING]: 'default',
      [BatchTaskStatus.PAUSED]: 'outline',
      [BatchTaskStatus.COMPLETED]: 'default',
      [BatchTaskStatus.FAILED]: 'destructive',
      [BatchTaskStatus.CANCELLED]: 'outline',
    } as const;

    const labels = {
      [BatchTaskStatus.PENDING]: '等待中',
      [BatchTaskStatus.PROCESSING]: '处理中',
      [BatchTaskStatus.PAUSED]: '已暂停',
      [BatchTaskStatus.COMPLETED]: '已完成',
      [BatchTaskStatus.FAILED]: '失败',
      [BatchTaskStatus.CANCELLED]: '已取消',
    };

    return (
      <Badge variant={variants[status]}>
        {getStatusIcon(status)}
        <span className="ml-1">{labels[status]}</span>
      </Badge>
    );
  };

  const getTaskTypeIcon = (type: TaskType) => {
    switch (type) {
      case TaskType.TEXT_TO_IMAGE:
        return <MessageSquare className="h-4 w-4" />;
      case TaskType.IMAGE_TO_IMAGE:
        return <ImageIcon className="h-4 w-4" />;
      case TaskType.MIXED:
        return <Settings className="h-4 w-4" />;
    }
  };

  const handleStartTask = async (taskId: string) => {
    try {
      console.log('开始执行任务:', taskId);
      await batchTaskManager.startTask(taskId);
      toast.success('任务已开始执行');
    } catch (error) {
      console.error('启动任务失败:', error);
      toast.error(
        `启动任务失败: ${error instanceof Error ? error.message : '未知错误'}`
      );
    }
  };

  const handlePauseTask = (taskId: string) => {
    batchTaskManager.pauseTask(taskId);
    toast.success('任务已暂停');
  };

  const handleResumeTask = async (taskId: string) => {
    try {
      await batchTaskManager.resumeTask(taskId);
      toast.success('任务已恢复');
    } catch (error) {
      console.error('恢复任务失败:', error);
      toast.error(
        `恢复任务失败: ${error instanceof Error ? error.message : '未知错误'}`
      );
    }
  };

  const handleStopTask = (taskId: string) => {
    batchTaskManager.stopTask(taskId);
    toast.success('任务已停止');
  };

  const handleDeleteTask = async (taskId: string) => {
    try {
      console.log('[UI] start delete flow', { taskId });
      // 先停止任务（如果正在运行或暂停）
      const task = batchTaskManager.getTask(taskId);
      console.log('[UI] current task snapshot', { task });
      if (
        task &&
        (task.status === BatchTaskStatus.PROCESSING ||
          task.status === BatchTaskStatus.PAUSED)
      ) {
        console.log('[UI] task processing/paused, stopping...', { taskId });
        batchTaskManager.stopTask(taskId);
      }

      // 删除任务 - 这会自动调用 storage.removeBatchTask
      console.log('[UI] deleting task via manager', { taskId });
      batchTaskManager.deleteTask(taskId);

      // 通知父组件更新状态
      console.log('[UI] notifying parent onTaskDelete', { taskId });
      onTaskDelete(taskId);
      console.log('[UI] delete flow done', { taskId });
      toast.success('任务已删除');
    } catch (error) {
      console.error('删除任务失败:', error);
      toast.error('删除任务失败');
    } finally {
      setIsDeleteConfirmOpen(false);
      setPendingDeleteTaskId(null);
    }
  };

  const handleViewTask = (task: BatchTask) => {
    setSelectedTask(task);
    setIsDialogOpen(true);
  };

  const handleDownloadResults = async (task: BatchTask) => {
    const downloadableResults = task.results.filter(
      r => r.imageUrl && !r.downloaded
    );

    if (downloadableResults.length === 0) {
      toast.info('没有可下载的图片');
      return;
    }

    // 点击后立即标记这些 URL 为手动下载中，以即时显示黄色 loading
    setManualDownloading(prev => {
      const next = new Set(prev);
      downloadableResults.forEach(r => next.add(r.imageUrl));
      return next;
    });

    // 使用统一的下载服务
    const added = await downloadService.downloadBatchImages(
      downloadableResults,
      task.name,
      {
        showToast: true,
      }
    );

    toast.success(`开始下载 ${added.length} 张图片`);
  };

  const handleDownloadSingle = async (
    url: string,
    filename: string,
    taskItemId?: string
  ) => {
    // 立即设置下载状态
    setManualDownloading(prev => new Set(prev).add(url));

    // 找到对应的TaskResult
    const tasks = await storage.getBatchTasks();
    let targetTaskName = 'single';

    for (const task of tasks) {
      const result = task.results.find(r => r.imageUrl === url);
      if (result) {
        targetTaskName = task.name;
        break;
      }
    }

    try {
      // 使用统一的下载服务
      await downloadService.downloadImage(url, {
        taskName: targetTaskName,
        showToast: true,
      });
    } catch (error) {
      console.error('下载失败:', error);
      // 下载失败，移除下载状态
      setManualDownloading(prev => {
        const newSet = new Set(prev);
        newSet.delete(url);
        return newSet;
      });
    }
  };

  const handleRetryFailed = (taskId: string) => {
    batchTaskManager.retryFailedItems(taskId);
    toast.success('已重试失败任务');
  };

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString('zh-CN');
  };

  const formatDuration = (start: string, end?: string) => {
    const startTime = new Date(start).getTime();
    const endTime = end ? new Date(end).getTime() : Date.now();
    let duration = Math.max(0, Math.floor((endTime - startTime) / 1000));

    if (duration < 60) return `${duration}秒`;
    if (duration < 3600) return `${Math.floor(duration / 60)}分钟`;
    return `${Math.floor(duration / 3600)}小时${Math.floor(
      (duration % 3600) / 60
    )}分钟`;
  };

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
          tasks.map(task => (
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
                          <span className="ml-3">
                            运行时间:{' '}
                            {formatDuration(task.startedAt, task.completedAt)}
                          </span>
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
                  下载目录:{' '}
                  {storage.getDownloadConfig().defaultPath ||
                    '未设置（使用浏览器默认）'}
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
                    <p className="font-medium text-green-600">
                      {task.completedItems}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-500">失败</p>
                    <p className="font-medium text-red-600">
                      {task.failedItems}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-500">模型</p>
                    <p className="font-medium">{task.config.model}</p>
                  </div>
                </div>
                {task.status === BatchTaskStatus.COMPLETED &&
                  task.results.length > 0 && (
                    <div className="text-xs text-gray-500">
                      总耗时:{' '}
                      {Math.round(
                        task.results.reduce(
                          (s, r) => s + (r.durationMs || 0),
                          0
                        ) / 1000
                      )}{' '}
                      秒
                    </div>
                  )}

                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>进度</span>
                    <span>{task.progress}%</span>
                  </div>
                  <Progress value={task.progress} className="h-2" />
                </div>

                {(task.status === BatchTaskStatus.PROCESSING ||
                  task.status === BatchTaskStatus.PAUSED) &&
                  task.startedAt && (
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
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePauseTask(task.id)}
                        className="flex-1"
                      >
                        <Pause className="h-4 w-4 mr-1" />
                        暂停
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleStopTask(task.id)}
                        className="flex-1"
                      >
                        <Square className="h-4 w-4 mr-1" />
                        停止
                      </Button>
                    </>
                  )}

                  {task.status === BatchTaskStatus.PAUSED && (
                    <>
                      <Button
                        size="sm"
                        onClick={() => handleResumeTask(task.id)}
                        className="flex-1"
                      >
                        <Play className="h-4 w-4 mr-1" />
                        恢复
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleStopTask(task.id)}
                        className="flex-1"
                      >
                        <Square className="h-4 w-4 mr-1" />
                        停止
                      </Button>
                    </>
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

                  {task.failedItems > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleRetryFailed(task.id)}
                    >
                      <RefreshCcw className="h-4 w-4 mr-1" />
                      重试失败
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
                    onClick={() => openDeleteConfirm(task.id)}
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
      <TaskDetailDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        selectedTask={selectedTask}
        dlProgress={dlProgress}
        manualDownloading={manualDownloading}
        setManualDownloading={setManualDownloading}
        setPreviewImage={setPreviewImage}
        setDebugLogItem={setDebugLogItem}
        setIsDebugLogOpen={setIsDebugLogOpen}
      />
      {previewImage && (
        <Dialog
          open={!!previewImage}
          onOpenChange={() => setPreviewImage(null)}
        >
          <DialogContent className="max-w-3xl max-h-[80vh]">
            <div className="relative w-full max-h-[70vh] aspect-[4/3] p-2">
              <Image
                src={previewImage}
                alt="预览"
                fill
                className="object-contain"
              />
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* 调试日志对话框 */}
      {debugLogItem && (
        <Dialog open={isDebugLogOpen} onOpenChange={setIsDebugLogOpen}>
          <DialogContent className="max-w-4xl max-h-[80vh]">
            <DialogHeader>
              <DialogTitle>
                调试日志 - 任务 #{debugLogItem.id.slice(-6)}
              </DialogTitle>
            </DialogHeader>
            <ScrollArea className="max-h-[60vh]">
              <div className="space-y-4">
                {debugLogItem.debugLogs?.map(log => (
                  <div key={log.id} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {log.type === 'request' && (
                          <MessageSquare className="h-4 w-4 text-blue-500" />
                        )}
                        {log.type === 'response' && (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        )}
                        {log.type === 'error' && (
                          <AlertCircle className="h-4 w-4 text-red-500" />
                        )}
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
      {/* 删除确认对话框 */}
      <Dialog
        open={isDeleteConfirmOpen}
        onOpenChange={open => {
          setIsDeleteConfirmOpen(open);
          if (!open) setPendingDeleteTaskId(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-gray-600">
            确定要删除这个批量任务吗？此操作不可撤销。
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                console.log('[UI] delete cancel');
                setIsDeleteConfirmOpen(false);
                setPendingDeleteTaskId(null);
              }}
            >
              取消
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => {
                if (pendingDeleteTaskId) {
                  handleDeleteTask(pendingDeleteTaskId);
                }
              }}
            >
              删除
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

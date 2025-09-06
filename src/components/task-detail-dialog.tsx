'use client';

import React, { memo, useCallback } from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Download,
  AlertCircle,
  CheckCircle,
  Clock,
  Loader2,
  MessageSquare,
  RefreshCcw,
  Image as ImageIcon,
} from 'lucide-react';
import {
  BatchTask,
  BatchTaskStatus,
  TaskType,
  TaskResult,
  TaskItem,
} from '@/types';
import { batchTaskManager } from '@/lib/batch-task-manager';
import { toast } from 'sonner';
import { downloadService } from '@/lib/download-service';

// 本地图片组件 - 使用Tauri convertFileSrc
const LocalImage = memo(
  ({ localPath, fallbackUrl }: { localPath: string; fallbackUrl: string }) => {
    const [imageSrc, setImageSrc] = React.useState<string>('');

    React.useEffect(() => {
      if (typeof window !== 'undefined' && (window as any).__TAURI__) {
        const { convertFileSrc } = (window as any).__TAURI__.path;
        setImageSrc(convertFileSrc(localPath));
      } else {
        setImageSrc(fallbackUrl);
      }
    }, [localPath, fallbackUrl]);

    return (
      <Image
        src={imageSrc}
        alt="生成结果"
        fill
        className="object-cover"
        onError={() => {
          console.error('Failed to load local image:', localPath);
          setImageSrc(fallbackUrl);
        }}
      />
    );
  }
);

LocalImage.displayName = 'LocalImage';

// 工具函数
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
    case BatchTaskStatus.COMPLETED:
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    case BatchTaskStatus.FAILED:
      return <AlertCircle className="h-4 w-4 text-red-500" />;
    case BatchTaskStatus.PAUSED:
      return <Clock className="h-4 w-4 text-gray-500" />;
    case BatchTaskStatus.CANCELLED:
      return <AlertCircle className="h-4 w-4 text-gray-500" />;
    default:
      return <Clock className="h-4 w-4 text-gray-500" />;
  }
};

const getStatusBadge = (status: BatchTaskStatus) => {
  const variants: Record<
    BatchTaskStatus,
    'secondary' | 'default' | 'destructive'
  > = {
    [BatchTaskStatus.PENDING]: 'secondary',
    [BatchTaskStatus.PROCESSING]: 'default',
    [BatchTaskStatus.COMPLETED]: 'default',
    [BatchTaskStatus.FAILED]: 'destructive',
    [BatchTaskStatus.PAUSED]: 'secondary',
    [BatchTaskStatus.CANCELLED]: 'destructive',
  };

  const labels: Record<BatchTaskStatus, string> = {
    [BatchTaskStatus.PENDING]: '等待中',
    [BatchTaskStatus.PROCESSING]: '处理中',
    [BatchTaskStatus.COMPLETED]: '已完成',
    [BatchTaskStatus.FAILED]: '失败',
    [BatchTaskStatus.PAUSED]: '已暂停',
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
    default:
      return <MessageSquare className="h-4 w-4" />;
  }
};

// 任务详情对话框接口
interface TaskDetailDialogProps {
  /** 对话框是否打开 */
  open: boolean;
  /** 对话框状态变化回调 */
  onOpenChange: (open: boolean) => void;
  /** 当前选中的任务 */
  selectedTask: BatchTask | null;
  /** 下载进度信息 */
  dlProgress: Record<string, { progress: number; bytesPerSec: number }>;
  /** 手动下载中的URL集合 */
  manualDownloading: Set<string>;
  /** 设置手动下载状态 */
  setManualDownloading: React.Dispatch<React.SetStateAction<Set<string>>>;
  /** 设置预览图片 */
  setPreviewImage: (image: string) => void;
  /** 设置调试日志项 */
  setDebugLogItem: (item: TaskItem | null) => void;
  /** 设置调试日志对话框打开状态 */
  setIsDebugLogOpen: (open: boolean) => void;
}

// 任务详情对话框组件
export const TaskDetailDialog = memo<TaskDetailDialogProps>(
  (props: TaskDetailDialogProps) => {
    console.log('TaskDetailDialog props', props);
    const { open, onOpenChange, selectedTask, dlProgress, manualDownloading, setManualDownloading, setPreviewImage, setDebugLogItem, setIsDebugLogOpen } = props;
    // 处理单个下载 - 优化为异步，避免阻塞UI
    const handleDownloadSingle = useCallback(
      async (url: string, filename: string, taskItemId?: string) => {
        try {
          // 立即更新UI状态，不等待下载完成
          setManualDownloading(prev => new Set(prev).add(url));

          // 使用 setTimeout 确保下载操作不阻塞UI
          setTimeout(async () => {
            try {
              const result = await downloadService.downloadImage(url, {
                taskName: filename,
                showToast: true,
              });

              if (result) {
                toast.success(`下载完成: ${filename}`);
              } else {
                toast.error(`下载失败`);
              }
            } catch (error) {
              console.error('下载失败:', error);
              toast.error('下载失败');
            } finally {
              setManualDownloading(prev => {
                const newSet = new Set(prev);
                newSet.delete(url);
                return newSet;
              });
            }
          }, 0);
        } catch (error) {
          console.error('下载失败:', error);
          toast.error('下载失败');
          // 确保清理下载状态
          setManualDownloading(prev => {
            const newSet = new Set(prev);
            newSet.delete(url);
            return newSet;
          });
        }
      },
      [setManualDownloading]
    );

    // 处理重试失败任务
    const handleRetryFailed = useCallback((taskId: string) => {
      batchTaskManager.retryFailedItems(taskId);
      toast.success('已重试失败任务');
    }, []);

    // 处理任务项重试
    const handleRetryTaskItem = useCallback(
      async (taskId: string, itemId: string) => {
        try {
          await batchTaskManager.retryTaskItem(taskId, itemId);
          toast.success('已重新开始执行该任务项');
        } catch (error) {
          console.error('重试任务项失败:', error);
          toast.error('重试任务项失败');
        }
      },
      []
    );

    // 处理任务重试
    const handleRetryTask = useCallback(async (taskId: string) => {
      try {
        await batchTaskManager.retryTask(taskId);
        toast.success('已重新开始执行任务');
      } catch (error) {
        console.error('重试任务失败:', error);
        toast.error('重试任务失败');
      }
    }, []);

    // 处理批量下载 - 优化为异步，避免阻塞UI
    const handleBatchDownload = useCallback(
      async (results: TaskResult[], taskName: string) => {
        try {
          // 使用 setTimeout 确保批量下载不阻塞UI
          setTimeout(async () => {
            try {
              await downloadService.downloadBatchImages(results, taskName, {
                showToast: true,
              });
            } catch (error) {
              console.error('批量下载失败:', error);
              toast.error('批量下载失败');
            }
          }, 0);
        } catch (error) {
          console.error('批量下载失败:', error);
          toast.error('批量下载失败');
        }
      },
      []
    );

    if (!selectedTask) return null;

    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-[90vw] max-h-[85vh] w-[90vw]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {getTaskTypeIcon(selectedTask.type)}
              {selectedTask.name}
            </DialogTitle>
          </DialogHeader>

          <ScrollArea className="max-h-[70vh]">
            <div className="space-y-6 p-1">
              {/* 任务概览 */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-gray-50 p-3 rounded-lg">
                  <p className="text-sm text-gray-500">状态</p>
                  <div className="mt-1">
                    {getStatusBadge(selectedTask.status)}
                  </div>
                </div>
                <div className="bg-gray-50 p-3 rounded-lg">
                  <p className="text-sm text-gray-500">总任务数</p>
                  <p className="text-lg font-medium">
                    {selectedTask.totalItems}
                  </p>
                </div>
                <div className="bg-gray-50 p-3 rounded-lg">
                  <p className="text-sm text-gray-500">已完成</p>
                  <p className="text-lg font-medium text-green-600">
                    {selectedTask.completedItems}
                  </p>
                </div>
                <div className="bg-gray-50 p-3 rounded-lg">
                  <p className="text-sm text-gray-500">失败</p>
                  <p className="text-lg font-medium text-red-600">
                    {selectedTask.failedItems}
                  </p>
                </div>
              </div>

              {/* API 调用统计 */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-slate-50 border border-slate-100 p-3 rounded-lg">
                  <p className="text-xs font-medium text-slate-700 mb-1">
                    API 调用总数
                  </p>
                  <p className="text-lg font-bold text-slate-800">
                    {selectedTask.items.reduce(
                      (sum, item) => sum + (item.attemptCount || 0),
                      0
                    )}
                  </p>
                </div>
                <div className="bg-teal-50 border border-teal-100 p-3 rounded-lg">
                  <p className="text-xs font-medium text-teal-700 mb-1">
                    成功调用
                  </p>
                  <p className="text-lg font-bold text-teal-800">
                    {selectedTask.completedItems}
                  </p>
                </div>
                <div className="bg-rose-50 border border-rose-100 p-3 rounded-lg">
                  <p className="text-xs font-medium text-rose-700 mb-1">
                    失败调用
                  </p>
                  <p className="text-lg font-bold text-rose-800">
                    {selectedTask.failedItems}
                  </p>
                </div>
              </div>

              {/* 任务配置 */}
              <div className="bg-gray-50 border border-gray-100 rounded-lg p-4">
                <h4 className="font-semibold text-gray-800 mb-3 text-sm">
                  任务配置
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                  <div className="bg-white p-2 rounded border">
                    <p className="text-gray-500 font-medium">模型</p>
                    <p className="font-semibold text-gray-800">
                      {selectedTask.config.model}
                    </p>
                  </div>
                  <div className="bg-white p-2 rounded border">
                    <p className="text-gray-500 font-medium">图片比例</p>
                    <p className="font-semibold text-gray-800">
                      {selectedTask.config.aspectRatio}
                    </p>
                  </div>
                  <div className="bg-white p-2 rounded border">
                    <p className="text-gray-500 font-medium">图片尺寸</p>
                    <p className="font-semibold text-gray-800">
                      {selectedTask.config.size}
                    </p>
                  </div>
                  <div className="bg-white p-2 rounded border">
                    <p className="text-gray-500 font-medium">并发数量</p>
                    <p className="font-semibold text-gray-800">
                      {selectedTask.config.concurrentLimit}
                    </p>
                  </div>
                  <div className="bg-white p-2 rounded border">
                    <p className="text-gray-500 font-medium">重试次数</p>
                    <p className="font-semibold text-gray-800">
                      {selectedTask.config.retryAttempts}
                    </p>
                  </div>
                  <div className="bg-white p-2 rounded border">
                    <p className="text-gray-500 font-medium">自动下载</p>
                    <p className="font-semibold text-gray-800">
                      {selectedTask.config.autoDownload ? '是' : '否'}
                    </p>
                  </div>
                </div>
              </div>

              {/* 任务项列表 */}
              {selectedTask.items.length > 0 && (
                <div>
                  <h4 className="font-semibold text-gray-800 mb-3 text-sm">
                    任务项 ({selectedTask.items.length})
                  </h4>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {selectedTask.items.slice(0, 10).map(item => {
                      // 获取最新的API调用记录
                      const latestRequest = item.debugLogs?.find(
                        log => log.type === 'request'
                      );
                      const latestResponse = item.debugLogs?.find(
                        log => log.type === 'response'
                      );
                      const latestError = item.debugLogs?.find(
                        log => log.type === 'error'
                      );

                      return (
                        <div
                          key={item.id}
                          className="border border-gray-200 rounded-lg p-3 bg-white"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              {getStatusIcon(item.status)}
                              <span className="text-sm font-medium">
                                任务 #{item.id.slice(-6)}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge
                                variant={
                                  item.status === BatchTaskStatus.COMPLETED
                                    ? 'default'
                                    : item.status === BatchTaskStatus.FAILED
                                    ? 'destructive'
                                    : 'secondary'
                                }
                              >
                                {item.status === BatchTaskStatus.COMPLETED
                                  ? '完成'
                                  : item.status === BatchTaskStatus.FAILED
                                  ? '失败'
                                  : item.status === BatchTaskStatus.PROCESSING
                                  ? '处理中'
                                  : '等待中'}
                              </Badge>

                              {/* 重试按钮 - 只对失败的任务项显示 */}
                              {item.status === BatchTaskStatus.FAILED && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-6 px-2 text-xs"
                                  onClick={() =>
                                    handleRetryTaskItem(
                                      selectedTask.id,
                                      item.id
                                    )
                                  }
                                >
                                  <RefreshCcw className="h-3 w-3 mr-1" />
                                  重试
                                </Button>
                              )}

                              {(latestRequest ||
                                latestResponse ||
                                latestError) && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-6 px-2 text-xs"
                                  onClick={() => {
                                    setDebugLogItem(item);
                                    setIsDebugLogOpen(true);
                                  }}
                                >
                                  查看API记录
                                </Button>
                              )}
                            </div>
                          </div>
                          <p className="text-sm text-gray-600 line-clamp-2">
                            {item.prompt}
                          </p>

                          {/* 显示API调用耗时 */}
                          {latestResponse && latestResponse.duration && (
                            <p className="text-xs text-blue-600 mt-1">
                              API耗时:{' '}
                              {latestResponse.duration
                                ? `${(latestResponse.duration / 1000).toFixed(
                                    1
                                  )}s`
                                : 'N/A'}
                            </p>
                          )}

                          {item.error && (
                            <p className="text-xs text-red-500 mt-1">
                              错误: {item.error}
                            </p>
                          )}
                        </div>
                      );
                    })}
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
                    <h4 className="font-medium">
                      生成结果 ({selectedTask.results.length})
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {/* API重试 - 重新生成失败的任务 */}
                      {selectedTask.failedItems > 0 && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRetryFailed(selectedTask.id)}
                        >
                          <RefreshCcw className="h-3 w-3 mr-1" />
                          重试API失败
                        </Button>
                      )}

                      {/* 任务重试 - 重试全部任务 */}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRetryTask(selectedTask.id)}
                      >
                        <RefreshCcw className="h-3 w-3 mr-1" />
                        重试全部任务
                      </Button>

                      {/* 任务重试 - 重试失败任务 */}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRetryFailed(selectedTask.id)}
                      >
                        <RefreshCcw className="h-3 w-3 mr-1" />
                        重试失败任务
                      </Button>

                      {/* 下载重试 - 重新下载失败的任务 */}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const failedResults = selectedTask.results.filter(
                            r => r.imageUrl && !r.downloaded
                          );
                          if (failedResults.length > 0) {
                            handleBatchDownload(
                              failedResults,
                              selectedTask.name
                            );
                          }
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
                          const allResults = selectedTask.results.filter(
                            r => r.imageUrl
                          );
                          if (allResults.length > 0) {
                            handleBatchDownload(allResults, selectedTask.name);
                          }
                        }}
                      >
                        <Download className="h-3 w-3 mr-1" />
                        重新下载全部
                      </Button>
                    </div>
                  </div>
                  <div className="max-h-80 overflow-y-auto pl-2">
                    <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-4">
                      {selectedTask.results.map((result, index) => {
                        const prog = dlProgress[result.imageUrl];
                        const progress =
                          prog?.progress ?? (result.downloaded ? 1 : 0);
                        const isDownloading =
                          manualDownloading.has(result.imageUrl) ||
                          (prog !== undefined && progress < 1);
                        const hasLocalPath =
                          result.localPath && result.localPath.length > 0;

                        // 添加详细的调试日志
                        console.log(`🖼️ 图片 ${index + 1} 渲染信息:`, {
                          id: result.id,
                          imageUrl: result.imageUrl,
                          localPath: result.localPath,
                          downloaded: result.downloaded,
                          hasLocalPath,
                          willShowLocal: hasLocalPath,
                        });

                        return (
                          <div
                            key={result.id}
                            className="group relative w-20 h-20 md:w-24 md:h-24 rounded-md overflow-hidden ring-1 ring-gray-200"
                            onDoubleClick={() => {
                              console.log(`🖱️ 双击图片预览:`, {
                                hasLocalPath,
                                localPath: result.localPath,
                                imageUrl: result.imageUrl,
                              });

                              if (hasLocalPath) {
                                // 直接使用本地文件路径
                                console.log(
                                  `📱 使用本地文件预览: ${result.localPath}`
                                );
                                setPreviewImage(result.localPath!);
                              } else {
                                console.log(
                                  `🌐 使用网络图片预览: ${result.imageUrl}`
                                );
                                setPreviewImage(result.imageUrl);
                              }
                            }}
                          >
                            {hasLocalPath ? (
                              <LocalImage
                                localPath={result.localPath!}
                                fallbackUrl={result.imageUrl}
                              />
                            ) : (
                              (() => {
                                console.log(
                                  `🌐 显示网络图片: ${result.imageUrl}`
                                );
                                return (
                                  <Image
                                    src={result.imageUrl}
                                    alt="生成结果"
                                    fill
                                    className="object-cover"
                                    onError={e => {
                                      console.error(
                                        'Failed to load remote image:',
                                        result.imageUrl
                                      );
                                      const img = e.target as HTMLImageElement;
                                      img.style.display = 'none';
                                      const parent = img.parentElement;
                                      if (parent) {
                                        const fallback =
                                          document.createElement('div');
                                        fallback.className =
                                          'w-full h-full bg-gray-200 flex items-center justify-center text-gray-400 text-xs';
                                        fallback.textContent = '加载失败';
                                        parent.appendChild(fallback);
                                      }
                                    }}
                                  />
                                );
                              })()
                            )}

                            {/* 下载进度遮罩：自上而下露出 */}
                            {isDownloading && (
                              <div className="absolute inset-0 pointer-events-none">
                                <div
                                  className="absolute top-0 left-0 right-0 bg-black/50 transition-all duration-150 ease-linear"
                                  style={{
                                    height: `${Math.max(
                                      0,
                                      100 - Math.floor(progress * 100)
                                    )}%`,
                                  }}
                                />
                                <div className="absolute bottom-0 left-0 right-0 text-[10px] text-white bg-black/60 px-1 py-[2px] flex items-center justify-between backdrop-blur-sm">
                                  <span className="font-medium">
                                    {Math.floor(progress * 100)}%
                                  </span>
                                  <span>
                                    {fmtSpeed(prog?.bytesPerSec || 0)}
                                  </span>
                                </div>
                              </div>
                            )}

                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                            <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-[10px] text-white px-1 py-[2px] flex items-center justify-between">
                              <span className="truncate">
                                {result.id.slice(-6)}
                                {result.durationMs
                                  ? ` · ${(result.durationMs / 1000).toFixed(
                                      1
                                    )}s`
                                  : ''}
                              </span>
                              {result.downloaded && (
                                <CheckCircle className="h-3 w-3 text-green-400" />
                              )}
                              {!result.downloaded &&
                                manualDownloading.has(result.imageUrl) && (
                                  <Loader2 className="h-3 w-3 text-yellow-400 animate-spin" />
                                )}
                              {!result.downloaded &&
                                !manualDownloading.has(result.imageUrl) &&
                                result.localPath && (
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
                                onClick={e => {
                                  e.stopPropagation();
                                  handleDownloadSingle(
                                    result.imageUrl,
                                    `result_${result.id}.png`,
                                    result.taskItemId
                                  );
                                }}
                                title={
                                  result.downloaded ? '重新下载' : '重试下载'
                                }
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
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    );
  }
);

TaskDetailDialog.displayName = 'TaskDetailDialog';

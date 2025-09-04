import { storage } from './storage'

/**
 * 清理旧的批量任务数据，修复硬编码的本地路径
 */
export function cleanupOldBatchTasks(): void {
  const tasks = storage.getBatchTasks()
  let updatedCount = 0
  
  tasks.forEach(task => {
    let taskUpdated = false
    
    task.results.forEach(result => {
      // 检查是否有旧的硬编码路径格式
      if (result.localPath && result.localPath.startsWith('batch_') && result.localPath.endsWith('.png')) {
        // 清除旧的硬编码路径，让下载服务重新生成正确的路径
        result.localPath = ''
        result.downloaded = false
        taskUpdated = true
        updatedCount++
        console.log('清理旧路径:', result.id, '原路径:', result.localPath)
      }
    })
    
    if (taskUpdated) {
      storage.saveBatchTask(task)
    }
  })
  
  if (updatedCount > 0) {
    console.log(`清理完成: 修复了 ${updatedCount} 个旧的本地路径`)
  }
}

// 自动执行清理（可选）
if (typeof window !== 'undefined') {
  // 在开发模式下自动清理
  if (process.env.NODE_ENV === 'development') {
    setTimeout(() => {
      cleanupOldBatchTasks()
    }, 1000)
  }
}
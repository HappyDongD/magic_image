import { invoke } from '@tauri-apps/api/core';
import { BatchTask, BatchTaskStatus, TaskType, CustomModel, ModelConfig, DownloadConfig, GeneratedImage, ApiConfig } from '@/types';

export interface SQLiteStorage {
  // 批量任务相关操作
  getBatchTasks(): Promise<BatchTask[]>;
  saveBatchTask(task: BatchTask): Promise<void>;
  removeBatchTask(taskId: string): Promise<void>;
  clearBatchTasks(): Promise<void>;
  
  // 存储管理
  getTaskCount(): Promise<number>;
  cleanupOldTasks(maxTasksToKeep?: number): Promise<number>;
}

// SQLite 存储实现
export const sqliteStorage: SQLiteStorage = {
  // 获取所有批量任务
  async getBatchTasks(): Promise<BatchTask[]> {
    if (typeof window === 'undefined') {
      return []; // SSR环境返回空数组
    }
    try {
      return await invoke('get_batch_tasks');
    } catch (error) {
      console.error('获取批量任务失败:', error);
      return [];
    }
  },

  // 保存批量任务
  async saveBatchTask(task: BatchTask): Promise<void> {
    if (typeof window === 'undefined') {
      return; // SSR环境直接返回
    }
    try {
      await invoke('save_batch_task', { task });
    } catch (error) {
      console.error('保存批量任务失败:', error);
      throw new Error(`保存任务失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  },

  // 删除批量任务
  async removeBatchTask(taskId: string): Promise<void> {
    if (typeof window === 'undefined') {
      return; // SSR环境直接返回
    }
    try {
      await invoke('delete_batch_task', { taskId });
    } catch (error) {
      console.error('删除批量任务失败:', error);
      throw new Error(`删除任务失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  },

  // 清空所有批量任务
  async clearBatchTasks(): Promise<void> {
    if (typeof window === 'undefined') {
      return; // SSR环境直接返回
    }
    try {
      await invoke('clear_batch_tasks');
    } catch (error) {
      console.error('清空批量任务失败:', error);
      throw new Error(`清空任务失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  },

  // 获取任务数量
  async getTaskCount(): Promise<number> {
    if (typeof window === 'undefined') {
      return 0; // SSR环境返回0
    }
    try {
      return await invoke('get_task_count');
    } catch (error) {
      console.error('获取任务数量失败:', error);
      return 0;
    }
  },

  // 清理旧任务
  async cleanupOldTasks(maxTasksToKeep: number = 100): Promise<number> {
    if (typeof window === 'undefined') {
      return 0; // SSR环境返回0
    }
    try {
      return await invoke('cleanup_old_tasks', { maxTasksToKeep });
    } catch (error) {
      console.error('清理旧任务失败:', error);
      throw new Error(`清理任务失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }
};

// 兼容性包装器 - 可以逐步替换现有的 storage 使用
export const storage = {
  ...sqliteStorage,
  
  // 保持与原有接口的兼容性
  getBatchTasks: sqliteStorage.getBatchTasks,
  saveBatchTask: sqliteStorage.saveBatchTask,
  removeBatchTask: sqliteStorage.removeBatchTask,
  clearBatchTasks: sqliteStorage.clearBatchTasks,
  
  // 其他存储方法可以继续使用 localStorage
  getApiConfig: () => {
    if (typeof window === 'undefined') return null;
    const data = localStorage.getItem('ai-drawing-api-config');
    return data ? JSON.parse(data) : null;
  },
  
  setApiConfig: (key: string, baseUrl: string) => {
    if (typeof window === 'undefined') return;
    const apiConfig = { key, baseUrl, createdAt: new Date().toISOString() };
    localStorage.setItem('ai-drawing-api-config', JSON.stringify(apiConfig));
  },

  // 激活信息
  getLicenseInfo: () => {
    if (typeof window === 'undefined') return { activated: false };
    const raw = localStorage.getItem('ai-drawing-license-info');
    return raw ? JSON.parse(raw) : { activated: false };
  },
  
  saveLicenseInfo: (info: { licenseKey?: string; machineId?: string; activated?: boolean }) => {
    if (typeof window === 'undefined') return;
    localStorage.setItem('ai-drawing-license-info', JSON.stringify(info));
  },
  
  isActivated: () => {
    const lic = storage.getLicenseInfo();
    return !!lic.activated && !!lic.machineId && !!lic.licenseKey;
  },

  // 自定义模型相关操作
  getCustomModels: (): CustomModel[] => {
    if (typeof window === 'undefined') return [];
    const data = localStorage.getItem('ai-drawing-custom-models');
    return data ? JSON.parse(data) : [];
  },

  addCustomModel: (model: CustomModel) => {
    if (typeof window === 'undefined') return;
    const models = storage.getCustomModels();
    models.push(model);
    localStorage.setItem('ai-drawing-custom-models', JSON.stringify(models));
  },

  removeCustomModel: (id: string) => {
    if (typeof window === 'undefined') return;
    const models = storage.getCustomModels();
    const filtered = models.filter((model: CustomModel) => model.id !== id);
    localStorage.setItem('ai-drawing-custom-models', JSON.stringify(filtered));
  },

  updateCustomModel: (id: string, updated: Partial<CustomModel>) => {
    if (typeof window === 'undefined') return;
    const models = storage.getCustomModels();
    const index = models.findIndex((model: CustomModel) => model.id === id);
    if (index !== -1) {
      models[index] = { ...models[index], ...updated };
      localStorage.setItem('ai-drawing-custom-models', JSON.stringify(models));
    }
  },

  // 模型配置相关操作
  getModelConfigs: () => {
    if (typeof window === 'undefined') return [];
    const data = localStorage.getItem('ai-drawing-model-configs');
    return data ? JSON.parse(data) : [];
  },

  saveModelConfig: (config: ModelConfig) => {
    if (typeof window === 'undefined') return;
    const configs = storage.getModelConfigs();
    const existingIndex = configs.findIndex((c: ModelConfig) => c.id === config.id);
    if (existingIndex !== -1) {
      configs[existingIndex] = config;
    } else {
      configs.push(config);
    }
    localStorage.setItem('ai-drawing-model-configs', JSON.stringify(configs));
  },

  removeModelConfig: (configId: string) => {
    if (typeof window === 'undefined') return;
    const configs = storage.getModelConfigs();
    const filtered = configs.filter((config: ModelConfig) => config.id !== configId);
    localStorage.setItem('ai-drawing-model-configs', JSON.stringify(filtered));
  },

  // 下载配置相关操作
  getDownloadConfig: () => {
    if (typeof window === 'undefined') return {
      autoDownload: false,
      defaultPath: '',
      organizeByDate: true,
      organizeByTask: true,
      filenameTemplate: '{task}_{index}_{timestamp}'
    };
    const data = localStorage.getItem('ai-drawing-download-config');
    return data ? JSON.parse(data) : {
      autoDownload: false,
      defaultPath: '',
      organizeByDate: true,
      organizeByTask: true,
      filenameTemplate: '{task}_{index}_{timestamp}'
    };
  },

  saveDownloadConfig: (config: DownloadConfig) => {
    if (typeof window === 'undefined') return;
    localStorage.setItem('ai-drawing-download-config', JSON.stringify(config));
  },

  // 历史记录相关操作
  getHistory: (): GeneratedImage[] => {
    if (typeof window === 'undefined') return [];
    const data = localStorage.getItem('ai-drawing-history');
    return data ? JSON.parse(data) : [];
  },

  addToHistory: (image: GeneratedImage) => {
    if (typeof window === 'undefined') return;
    const history = storage.getHistory();
    history.unshift(image);
    localStorage.setItem('ai-drawing-history', JSON.stringify(history));
  },

  clearHistory: () => {
    if (typeof window === 'undefined') return;
    localStorage.removeItem('ai-drawing-history');
  },

  removeFromHistory: (id: string) => {
    if (typeof window === 'undefined') return;
    const history = storage.getHistory();
    const filtered = history.filter((img: GeneratedImage) => img.id !== id);
    localStorage.setItem('ai-drawing-history', JSON.stringify(filtered));
  }
};

export default sqliteStorage;
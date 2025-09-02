import { invoke } from '@tauri-apps/api/core'

/**
 * 读取本地文件并转换为 base64 数据 URL
 * @param path 本地文件路径
 * @returns Promise<string> base64 数据 URL
 */
export async function readLocalFile(path: string): Promise<string> {
  try {
    return await invoke('read_local_file', { path })
  } catch (error) {
    console.error('读取本地文件失败:', error)
    throw error
  }
}
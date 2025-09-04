import { toast } from 'sonner'

const ENCRYPTION_KEY = 'my-super-secret-encryption-key-2024'

export class ActivationService {
  private static instance: ActivationService
  private machineCode: string = ''
  private isActivated: boolean = false

  private constructor() {
    this.loadActivationStatus()
  }

  static getInstance(): ActivationService {
    if (!ActivationService.instance) {
      ActivationService.instance = new ActivationService()
    }
    return ActivationService.instance
  }

  /**
   * 生成机器码（使用Rust后端获取硬件机器码）
   */
  async generateMachineCode(): Promise<string> {
    if (this.machineCode) {
      return this.machineCode
    }

    try {
      // 使用Rust后端获取机器码
      const { invoke } = await import('@tauri-apps/api/tauri')
      this.machineCode = await invoke('get_machine_id')
      return this.machineCode
    } catch (error) {
      console.error('从Rust获取机器码失败:', error)
      // 回退到基于时间戳的机器码
      this.machineCode = this.generateFallbackMachineCode()
      return this.machineCode
    }
  }

  /**
   * 生成备用机器码（如果Rust后端不可用）
   */
  private generateFallbackMachineCode(): string {
    const timestamp = Date.now().toString()
    let hash = 0
    for (let i = 0; i < timestamp.length; i++) {
      const char = timestamp.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // Convert to 32bit integer
    }
    return Math.abs(hash).toString(16).substring(0, 16).toUpperCase()
  }

  /**
   * SHA256 哈希函数
   */
  private async sha256(message: string): Promise<string> {
    const encoder = new TextEncoder()
    const data = encoder.encode(message)
    const hash = await crypto.subtle.digest('SHA-256', data)
    return Array.from(new Uint8Array(hash))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
  }

  /**
   * 验证激活码
   */
  async verifyActivationCode(activationCode: string): Promise<boolean> {
    try {
      const machineCode = await this.generateMachineCode()
      
      // 生成期望的激活码
      const combinedData = machineCode + ENCRYPTION_KEY
      const hash = await this.sha256(combinedData)
      
      // 取前8个字节转换为十六进制
      let expectedCode = ''
      for (let i = 0; i < 8; i++) {
        const hex = hash.substring(i * 2, i * 2 + 2)
        expectedCode += hex
      }
      
      // 转换为大写
      const expectedCodeStr = expectedCode.toUpperCase()
      
      // 移除输入激活码的连字符并转换为大写
      const cleanInputCode = activationCode.replace(/-/g, '').toUpperCase()
      
      // 验证激活码是否匹配
      const isValid = cleanInputCode === expectedCodeStr
      
      if (isValid) {
        this.isActivated = true
        this.saveActivationStatus()
        toast.success('激活成功！')
      } else {
        toast.error('激活码无效')
      }
      
      console.log('激活码验证结果:', {
        isValid,
        expectedCode: expectedCodeStr,
        inputCode: cleanInputCode,
        machineCode
      })
      
      return isValid
    } catch (error) {
      console.error('激活码验证失败:', error)
      toast.error('激活验证失败')
      return false
    }
  }

  /**
   * 保存激活状态到本地存储
   */
  private saveActivationStatus(): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem('ai-drawing-activated', 'true')
      localStorage.setItem('ai-drawing-machine-code', this.machineCode)
    }
  }

  /**
   * 从本地存储加载激活状态
   */
  private loadActivationStatus(): void {
    if (typeof window !== 'undefined') {
      this.isActivated = localStorage.getItem('ai-drawing-activated') === 'true'
      this.machineCode = localStorage.getItem('ai-drawing-machine-code') || ''
    }
  }

  /**
   * 检查是否已激活（同步方法）
   */
  isAppActivated(): boolean {
    return this.isActivated
  }

  /**
   * 检查激活状态（异步方法，用于页面初始化）
   */
  async checkActivation(): Promise<boolean> {
    return this.isActivated
  }

  /**
   * 获取机器码（用于显示）
   */
  async getMachineCode(): Promise<string> {
    return await this.generateMachineCode()
  }

  /**
   * 重置激活状态（用于测试）
   */
  resetActivation(): void {
    this.isActivated = false
    if (typeof window !== 'undefined') {
      localStorage.removeItem('ai-drawing-activated')
    }
  }
}

// 创建全局激活服务实例
export const activationService = ActivationService.getInstance()
import { Tool } from '../types/openai-sdk.js';
import { createHash } from 'crypto';

export interface SessionTools {
  sessionId: string;
  tools: Tool[];
  signature: string;
  createdAt: Date;
  expiresAt: Date;
}

export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: any;
}

export class ToolManager {
  // 会话工具缓存 - 使用签名作为键
  private sessionToolsCache = new Map<string, SessionTools>();
  // 会话ID到签名的映射
  private sessionToSignature = new Map<string, string>();
  // 缓存时间（默认5分钟）
  private readonly cacheTimeout = 5 * 60 * 1000;

  /**
   * 为会话注册工具列表
   */
  registerSessionTools(sessionId: string, tools: Tool[]): string {
    // 生成工具列表的签名
    const signature = this.generateToolsSignature(tools);
    
    // 检查是否已有相同签名的缓存
    const existing = this.sessionToolsCache.get(signature);
    if (existing && existing.expiresAt > new Date()) {
      // 更新会话映射
      this.sessionToSignature.set(sessionId, signature);
      return signature;
    }

    // 创建新的缓存条目
    const sessionTools: SessionTools = {
      sessionId,
      tools,
      signature,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + this.cacheTimeout)
    };

    this.sessionToolsCache.set(signature, sessionTools);
    this.sessionToSignature.set(sessionId, signature);

    // 清理过期的缓存
    this.cleanupExpiredCache();

    return signature;
  }

  /**
   * 获取会话的工具列表
   */
  getSessionTools(sessionId: string): Tool[] {
    const signature = this.sessionToSignature.get(sessionId);
    if (!signature) {
      return [];
    }

    const sessionTools = this.sessionToolsCache.get(signature);
    if (!sessionTools || sessionTools.expiresAt < new Date()) {
      // 缓存已过期
      this.sessionToSignature.delete(sessionId);
      if (sessionTools) {
        this.sessionToolsCache.delete(signature);
      }
      return [];
    }

    return sessionTools.tools;
  }

  /**
   * 将 OpenAI 工具转换为 MCP 工具定义
   */
  convertToMCPTools(tools: Tool[]): MCPToolDefinition[] {
    return tools.map(tool => ({
      name: tool.function.name,
      description: tool.function.description || '',
      inputSchema: tool.function.parameters || {
        type: 'object',
        properties: {},
        required: []
      }
    }));
  }

  /**
   * 获取会话的 MCP 工具列表
   */
  getSessionMCPTools(sessionId: string): MCPToolDefinition[] {
    const tools = this.getSessionTools(sessionId);
    return this.convertToMCPTools(tools);
  }

  /**
   * 检查工具是否允许在会话中使用
   */
  isToolAllowed(sessionId: string, toolName: string): boolean {
    const tools = this.getSessionTools(sessionId);
    return tools.some(tool => tool.function.name === toolName);
  }

  /**
   * 获取工具定义
   */
  getToolDefinition(sessionId: string, toolName: string): Tool | undefined {
    const tools = this.getSessionTools(sessionId);
    return tools.find(tool => tool.function.name === toolName);
  }

  /**
   * 生成工具列表的签名
   */
  private generateToolsSignature(tools: Tool[]): string {
    // 对工具列表进行规范化和排序，确保相同的工具列表产生相同的签名
    const normalized = tools
      .map(tool => ({
        name: tool.function.name,
        description: tool.function.description || '',
        parameters: JSON.stringify(tool.function.parameters || {})
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const content = JSON.stringify(normalized);
    return createHash('sha256').update(content).digest('hex').substring(0, 16);
  }

  /**
   * 清理过期的缓存
   */
  private cleanupExpiredCache(): void {
    const now = new Date();
    const expiredSignatures: string[] = [];

    // 找出所有过期的缓存
    for (const [signature, sessionTools] of this.sessionToolsCache.entries()) {
      if (sessionTools.expiresAt < now) {
        expiredSignatures.push(signature);
      }
    }

    // 删除过期的缓存
    for (const signature of expiredSignatures) {
      this.sessionToolsCache.delete(signature);
      
      // 清理会话映射
      for (const [sessionId, sig] of this.sessionToSignature.entries()) {
        if (sig === signature) {
          this.sessionToSignature.delete(sessionId);
        }
      }
    }
  }

  /**
   * 获取缓存统计信息
   */
  getCacheStats(): {
    totalCached: number;
    activeSessions: number;
    cacheHitRate?: number;
  } {
    return {
      totalCached: this.sessionToolsCache.size,
      activeSessions: this.sessionToSignature.size
    };
  }

  /**
   * 清除特定会话的工具
   */
  clearSessionTools(sessionId: string): void {
    const signature = this.sessionToSignature.get(sessionId);
    if (signature) {
      this.sessionToSignature.delete(sessionId);
      
      // 检查是否还有其他会话使用相同的签名
      let inUse = false;
      for (const [_, sig] of this.sessionToSignature.entries()) {
        if (sig === signature) {
          inUse = true;
          break;
        }
      }
      
      // 如果没有其他会话使用，删除缓存
      if (!inUse) {
        this.sessionToolsCache.delete(signature);
      }
    }
  }
}
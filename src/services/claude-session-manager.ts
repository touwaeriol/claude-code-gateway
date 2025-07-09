import { SDKMessage } from '../types/claude.js';
import { ExtendedChatMessage as ChatMessage } from '../types/openai-sdk.js';
import { ClaudeService } from './claude-service.js';
import { ToolCallManager } from './tool-call-manager.js';
import { logger } from '../utils/unified-logger.js';

interface RunningSession {
  sessionId: string;
  promise: Promise<SDKMessage[]>;
  abortController: AbortController;
  createdAt: number;
  lastActivity: number;
  isWaitingForTool: boolean;
  pendingMessages: SDKMessage[];
}

/**
 * 管理运行中的 Claude Code 会话
 */
export class ClaudeSessionManager {
  private sessions = new Map<string, RunningSession>();
  private readonly sessionTimeout = 30 * 60 * 1000; // 30分钟超时
  
  constructor(
    private claudeService: ClaudeService,
    private toolCallManager: ToolCallManager
  ) {
    // 定期清理超时会话
    setInterval(() => this.cleanup(), 60000);
  }
  
  /**
   * 启动新的 Claude Code 会话
   */
  async startSession(
    sessionId: string,
    messages: ChatMessage[],
    model: string,
    customSystemPrompt?: string
  ): Promise<AsyncGenerator<SDKMessage>> {
    console.log(`启动新的 Claude Code 会话: ${sessionId}`);
    
    const abortController = new AbortController();
    
    // 保存会话信息（暂时不创建 promise）
    const session: RunningSession = {
      sessionId,
      promise: Promise.resolve([]), // 占位符，实际不使用
      abortController,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      isWaitingForTool: false,
      pendingMessages: []
    };
    
    this.sessions.set(sessionId, session);
    
    // 直接返回消息生成器，避免重复创建
    return this.createMessageGenerator(sessionId, messages, model, customSystemPrompt);
  }
  
  /**
   * 创建消息生成器
   */
  private async *createMessageGenerator(
    sessionId: string,
    messages: ChatMessage[],
    model: string,
    customSystemPrompt?: string
  ): AsyncGenerator<SDKMessage> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }
    
    const messageStream = this.claudeService.queryWithSDKStream({
      sessionId,
      model,
      messages,
      abortController: session.abortController,
      customSystemPrompt
    });
    
    for await (const message of messageStream) {
      session.pendingMessages.push(message);
      session.lastActivity = Date.now();
      
      // 检测工具调用
      if (message.type === 'assistant' && message.message && message.message.content) {
        const content = message.message.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === 'tool_use' && block.name.startsWith('mcp__gateway__')) {
              session.isWaitingForTool = true;
            }
          }
        }
      }
      
      yield message;
    }
  }
  
  /**
   * 恢复等待的会话
   */
  async resumeSession(sessionId: string): Promise<SDKMessage[] | null> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      console.log(`会话 ${sessionId} 不存在`);
      return null;
    }
    
    console.log(`恢复会话 ${sessionId}`);
    session.lastActivity = Date.now();
    session.isWaitingForTool = false;
    
    // 等待会话完成
    try {
      const messages = await session.promise;
      // 会话完成，移除
      this.sessions.delete(sessionId);
      return messages;
    } catch (error) {
      console.error(`会话 ${sessionId} 执行错误:`, error);
      this.sessions.delete(sessionId);
      throw error;
    }
  }
  
  /**
   * 检查会话是否在等待工具调用
   */
  isSessionWaitingForTool(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    return session?.isWaitingForTool || false;
  }
  
  /**
   * 获取会话的待处理消息
   */
  getPendingMessages(sessionId: string): SDKMessage[] {
    const session = this.sessions.get(sessionId);
    return session?.pendingMessages || [];
  }
  
  /**
   * 终止会话
   */
  abortSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      console.log(`终止会话 ${sessionId}`);
      // session.abortController.abort();
      this.sessions.delete(sessionId);
    }
  }
  
  /**
   * 清理完成的会话（非流式响应使用）
   */
  cleanupSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      console.log(`清理完成的会话 ${sessionId}`);
      this.sessions.delete(sessionId);
    }
  }
  
  /**
   * 清理超时会话
   */
  private cleanup(): void {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [sessionId, session] of this.sessions.entries()) {
      if (now - session.lastActivity > this.sessionTimeout) {
        console.log(`清理超时会话 ${sessionId}`);
        // session.abortController.abort();
        this.sessions.delete(sessionId);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      console.log(`清理了 ${cleaned} 个超时会话`);
    }
  }
  
  /**
   * 获取统计信息
   */
  getStats(): {
    total: number;
    waiting: number;
    active: number;
  } {
    let waiting = 0;
    let active = 0;
    
    for (const session of this.sessions.values()) {
      if (session.isWaitingForTool) {
        waiting++;
      } else {
        active++;
      }
    }
    
    return {
      total: this.sessions.size,
      waiting,
      active
    };
  }
}
import { EventEmitter } from 'events';

export interface PendingToolCall {
  toolCallId: string;
  sessionId: string;
  toolName: string;
  createdAt: Date;
  // Promise 用于阻塞等待结果
  promise: Promise<any>;
  resolve: (result: any) => void;
  reject: (error: any) => void;
}

export class ToolCallManager extends EventEmitter {
  private pendingCalls = new Map<string, PendingToolCall>();
  private sessionToToolCalls = new Map<string, Set<string>>();
  private readonly timeout = 2 * 60 * 1000; // 2分钟超时，与 Claude Code MCP 超时一致

  /**
   * 注册一个新的工具调用，返回一个 Promise 等待结果
   */
  registerToolCall(toolCallId: string, sessionId: string, toolName: string): Promise<any> {
    console.log(`注册工具调用: ${toolCallId} for session ${sessionId}`);

    let resolve: (result: any) => void;
    let reject: (error: any) => void;

    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });

    const pendingCall: PendingToolCall = {
      toolCallId,
      sessionId,
      toolName,
      createdAt: new Date(),
      promise,
      resolve: resolve!,
      reject: reject!
    };

    this.pendingCalls.set(toolCallId, pendingCall);

    // 维护会话到工具调用的映射
    if (!this.sessionToToolCalls.has(sessionId)) {
      this.sessionToToolCalls.set(sessionId, new Set());
    }
    this.sessionToToolCalls.get(sessionId)!.add(toolCallId);

    // 设置超时
    setTimeout(() => {
      if (this.pendingCalls.has(toolCallId)) {
        this.rejectToolCall(toolCallId, new Error(`Tool call ${toolCallId} timed out after ${this.timeout}ms`));
      }
    }, this.timeout);

    return promise;
  }

  /**
   * 解决一个工具调用，返回结果
   */
  resolveToolCall(toolCallId: string, result: any): boolean {
    const pendingCall = this.pendingCalls.get(toolCallId);
    if (!pendingCall) {
      console.warn(`工具调用 ${toolCallId} 不存在或已完成`);
      return false;
    }

    console.log(`解决工具调用: ${toolCallId} with result:`, result);
    pendingCall.resolve(result);
    
    // 清理
    this.pendingCalls.delete(toolCallId);
    const sessionCalls = this.sessionToToolCalls.get(pendingCall.sessionId);
    if (sessionCalls) {
      sessionCalls.delete(toolCallId);
      if (sessionCalls.size === 0) {
        this.sessionToToolCalls.delete(pendingCall.sessionId);
      }
    }

    return true;
  }

  /**
   * 拒绝一个工具调用
   */
  rejectToolCall(toolCallId: string, error: any): boolean {
    const pendingCall = this.pendingCalls.get(toolCallId);
    if (!pendingCall) {
      return false;
    }

    console.error(`拒绝工具调用: ${toolCallId} with error:`, error);
    pendingCall.reject(error);
    
    // 清理
    this.pendingCalls.delete(toolCallId);
    const sessionCalls = this.sessionToToolCalls.get(pendingCall.sessionId);
    if (sessionCalls) {
      sessionCalls.delete(toolCallId);
      if (sessionCalls.size === 0) {
        this.sessionToToolCalls.delete(pendingCall.sessionId);
      }
    }

    return true;
  }

  /**
   * 获取会话的所有待处理工具调用
   */
  getSessionToolCalls(sessionId: string): PendingToolCall[] {
    const toolCallIds = this.sessionToToolCalls.get(sessionId);
    if (!toolCallIds) {
      return [];
    }

    return Array.from(toolCallIds)
      .map(id => this.pendingCalls.get(id))
      .filter(call => call !== undefined) as PendingToolCall[];
  }

  /**
   * 取消会话的所有工具调用
   */
  cancelSessionToolCalls(sessionId: string): void {
    const toolCalls = this.getSessionToolCalls(sessionId);
    for (const call of toolCalls) {
      this.rejectToolCall(call.toolCallId, new Error('Session cancelled'));
    }
  }

  /**
   * 获取待处理的工具调用数量
   */
  getPendingCount(): number {
    return this.pendingCalls.size;
  }
}
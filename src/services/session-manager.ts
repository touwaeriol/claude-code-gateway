import { Tool } from '../types/openai';

export interface SessionContext {
  id: string;
  createdAt: Date;
  expiresAt: Date;
  tools?: Tool[];
  allowedTools: string[];
  metadata?: Record<string, any>;
}

export class SessionManager {
  private sessions = new Map<string, SessionContext>();
  private readonly sessionTimeout = 5 * 60 * 1000; // 5 minutes

  /**
   * 创建新会话
   */
  createSession(sessionId: string, tools?: Tool[]): SessionContext {
    const now = new Date();
    const context: SessionContext = {
      id: sessionId,
      createdAt: now,
      expiresAt: new Date(now.getTime() + this.sessionTimeout),
      tools,
      allowedTools: this.generateAllowedTools(tools),
      metadata: {}
    };

    this.sessions.set(sessionId, context);

    // 自动清理过期会话
    setTimeout(() => {
      this.removeSession(sessionId);
    }, this.sessionTimeout);

    return context;
  }

  /**
   * 获取会话
   */
  getSession(sessionId: string): SessionContext | undefined {
    const session = this.sessions.get(sessionId);
    if (session && session.expiresAt > new Date()) {
      return session;
    }
    
    // 如果会话已过期，删除它
    if (session) {
      this.removeSession(sessionId);
    }
    
    return undefined;
  }

  /**
   * 更新会话
   */
  updateSession(sessionId: string, updates: Partial<SessionContext>): void {
    const session = this.getSession(sessionId);
    if (session) {
      Object.assign(session, updates);
      this.sessions.set(sessionId, session);
    }
  }

  /**
   * 删除会话
   */
  removeSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  /**
   * 从工具定义生成允许的工具列表
   */
  private generateAllowedTools(tools?: Tool[]): string[] {
    if (!tools || tools.length === 0) {
      return [];
    }

    return tools.map(tool => {
      const name = tool.function.name;
      // 如果已经有前缀，直接使用；否则添加前缀
      return name.startsWith('mcp__') ? name : `mcp__gateway__${name}`;
    });
  }

  /**
   * 检查工具是否被允许
   */
  isToolAllowed(sessionId: string, toolName: string): boolean {
    const session = this.getSession(sessionId);
    if (!session) {
      return false;
    }

    return session.allowedTools.includes(toolName);
  }

  /**
   * 获取所有活跃会话数
   */
  getActiveSessionCount(): number {
    // 清理过期会话
    const now = new Date();
    for (const [id, session] of this.sessions.entries()) {
      if (session.expiresAt <= now) {
        this.sessions.delete(id);
      }
    }

    return this.sessions.size;
  }

  /**
   * 清理所有过期会话
   */
  cleanupExpiredSessions(): void {
    const now = new Date();
    for (const [id, session] of this.sessions.entries()) {
      if (session.expiresAt <= now) {
        this.sessions.delete(id);
      }
    }
  }
}
import { SessionManager } from './session-manager';
import { Tool } from '../types/openai';

export interface PermissionCheckResult {
  allowed: boolean;
  reason: string;
  toolName: string;
  sessionId: string;
  timestamp: Date;
}

export interface AuditLog {
  timestamp: Date;
  sessionId: string;
  action: 'permission_check' | 'tool_call' | 'session_created' | 'error';
  details: any;
}

export class PermissionController {
  private auditLogs: AuditLog[] = [];
  
  constructor(private sessionManager: SessionManager) {}

  /**
   * 检查工具调用权限
   */
  async checkPermission(
    toolName: string, 
    sessionId: string
  ): Promise<PermissionCheckResult> {
    const timestamp = new Date();
    
    // 获取会话
    const session = this.sessionManager.getSession(sessionId);
    
    if (!session) {
      const result = {
        allowed: false,
        reason: 'Session not found or expired',
        toolName,
        sessionId,
        timestamp
      };
      
      this.audit({
        timestamp,
        sessionId,
        action: 'permission_check',
        details: result
      });
      
      return result;
    }

    // 检查工具是否在允许列表中
    const isAllowed = this.sessionManager.isToolAllowed(sessionId, toolName);
    
    const result = {
      allowed: isAllowed,
      reason: isAllowed 
        ? 'Tool is in the allowed list for this session'
        : `Tool ${toolName} is not permitted for this session`,
      toolName,
      sessionId,
      timestamp
    };
    
    // 记录审计日志
    this.audit({
      timestamp,
      sessionId,
      action: 'permission_check',
      details: result
    });
    
    return result;
  }

  /**
   * 注册会话的工具权限
   */
  registerSession(sessionId: string, tools: Tool[]): void {
    const session = this.sessionManager.createSession(sessionId, tools);
    
    this.audit({
      timestamp: new Date(),
      sessionId,
      action: 'session_created',
      details: {
        allowedTools: session.allowedTools,
        toolCount: tools.length
      }
    });
  }

  /**
   * 记录审计日志
   */
  private audit(log: AuditLog): void {
    this.auditLogs.push(log);
    
    // 在生产环境中，这里应该将日志发送到持久化存储
    console.log('[AUDIT]', JSON.stringify(log));
    
    // 保持日志大小在合理范围内（内存中只保留最近1000条）
    if (this.auditLogs.length > 1000) {
      this.auditLogs = this.auditLogs.slice(-1000);
    }
  }

  /**
   * 获取会话的审计日志
   */
  getSessionAuditLogs(sessionId: string): AuditLog[] {
    return this.auditLogs.filter(log => log.sessionId === sessionId);
  }

  /**
   * 获取权限拒绝的统计
   */
  getDeniedStats(): {
    totalDenied: number;
    deniedByTool: Record<string, number>;
    deniedBySesssion: Record<string, number>;
  } {
    const denied = this.auditLogs.filter(
      log => log.action === 'permission_check' && !log.details.allowed
    );

    const deniedByTool: Record<string, number> = {};
    const deniedBySesssion: Record<string, number> = {};

    for (const log of denied) {
      const toolName = log.details.toolName;
      const sessionId = log.sessionId;
      
      deniedByTool[toolName] = (deniedByTool[toolName] || 0) + 1;
      deniedBySesssion[sessionId] = (deniedBySesssion[sessionId] || 0) + 1;
    }

    return {
      totalDenied: denied.length,
      deniedByTool,
      deniedBySesssion
    };
  }

  /**
   * 检测异常行为
   */
  detectAnomalies(sessionId: string): string[] {
    const alerts: string[] = [];
    const logs = this.getSessionAuditLogs(sessionId);
    
    // 检查短时间内大量被拒绝的请求
    const recentDenied = logs.filter(
      log => 
        log.action === 'permission_check' && 
        !log.details.allowed &&
        new Date().getTime() - log.timestamp.getTime() < 60000 // 最近1分钟
    );
    
    if (recentDenied.length > 10) {
      alerts.push(`High number of denied requests: ${recentDenied.length} in the last minute`);
    }
    
    // 检查尝试访问危险工具
    const dangerousTools = ['Bash', 'Edit', 'Write', 'Delete'];
    const dangerousAttempts = logs.filter(
      log => 
        log.action === 'permission_check' &&
        dangerousTools.some(tool => log.details.toolName.includes(tool))
    );
    
    if (dangerousAttempts.length > 0) {
      alerts.push(`Attempted to access dangerous tools: ${dangerousAttempts.length} times`);
    }
    
    return alerts;
  }
}
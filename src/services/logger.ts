import winston from 'winston';
import { Request } from 'express';

// 日志级别
export enum LogLevel {
  ERROR = 'error',
  WARN = 'warn',
  INFO = 'info',
  DEBUG = 'debug'
}

// 日志类别
export enum LogCategory {
  REQUEST = 'request',
  RESPONSE = 'response',
  TOOL_CALL = 'tool_call',
  PERMISSION = 'permission',
  SESSION = 'session',
  ERROR = 'error',
  AUDIT = 'audit'
}

export interface LogContext {
  sessionId?: string;
  requestId?: string;
  userId?: string;
  toolName?: string;
  action?: string;
  [key: string]: any;
}

export class Logger {
  private logger: winston.Logger;
  private auditLogger: winston.Logger;

  constructor() {
    // 主日志器
    this.logger = winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      transports: [
        // 控制台输出
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.printf(({ level, message, category, ...meta }) => {
              // 自定义格式，更易读
              const prefix = category ? `[${category}]` : '';
              const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
              return `${level}: ${prefix} ${message}${metaStr}`;
            })
          )
        }),
        // 文件输出 - 包含所有日志（包括 debug）
        new winston.transports.File({
          filename: 'logs/error.log',
          level: 'error'
        }),
        new winston.transports.File({
          filename: 'logs/combined.log',
          level: 'debug'  // 记录所有级别的日志
        }),
        // Debug 专用日志文件
        new winston.transports.File({
          filename: 'logs/debug.log',
          level: 'debug',
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.printf(({ timestamp, level, message, ...meta }) => {
              return `[${timestamp}] ${level}: ${message} ${JSON.stringify(meta)}`;
            })
          )
        })
      ]
    });

    // 审计日志器
    this.auditLogger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      transports: [
        new winston.transports.File({
          filename: 'logs/audit.log'
        })
      ]
    });
  }

  /**
   * 记录请求
   */
  logRequest(req: Request, requestId: string): void {
    this.log(LogLevel.INFO, LogCategory.REQUEST, 'Incoming request', {
      requestId,
      method: req.method,
      path: req.path,
      headers: this.sanitizeHeaders(req.headers),
      body: this.sanitizeBody(req.body)
    });
  }

  /**
   * 记录响应
   */
  logResponse(requestId: string, statusCode: number, responseTime: number): void {
    this.log(LogLevel.INFO, LogCategory.RESPONSE, 'Outgoing response', {
      requestId,
      statusCode,
      responseTime
    });
  }

  /**
   * 记录工具调用
   */
  logToolCall(context: LogContext & { 
    toolName: string; 
    args?: any; 
    result?: any; 
    success: boolean 
  }): void {
    const level = context.success ? LogLevel.INFO : LogLevel.WARN;
    this.log(level, LogCategory.TOOL_CALL, 'Tool call', {
      ...context,
      args: this.sanitizeData(context.args),
      result: this.sanitizeData(context.result)
    });

    // 同时记录到审计日志
    this.audit('tool_call', context);
  }

  /**
   * 记录权限检查
   */
  logPermissionCheck(context: LogContext & {
    toolName: string;
    allowed: boolean;
    reason: string;
  }): void {
    const level = context.allowed ? LogLevel.INFO : LogLevel.WARN;
    this.log(level, LogCategory.PERMISSION, 'Permission check', context);

    // 记录到审计日志
    this.audit('permission_check', context);
  }

  /**
   * 记录错误
   */
  logError(error: Error, context?: LogContext): void {
    this.log(LogLevel.ERROR, LogCategory.ERROR, error.message, {
      ...context,
      stack: error.stack,
      name: error.name
    });
  }

  /**
   * 记录审计事件
   */
  audit(action: string, context: LogContext): void {
    this.auditLogger.info({
      action,
      timestamp: new Date().toISOString(),
      ...context
    });
  }

  /**
   * 通用日志方法
   */
  log(level: LogLevel, category: LogCategory, message: string, context?: LogContext): void {
    this.logger.log(level, message, {
      category,
      ...context
    });
  }
  
  /**
   * Debug 日志快捷方法
   */
  debug(message: string, context?: LogContext): void {
    this.log(LogLevel.DEBUG, LogCategory.REQUEST, message, context);
  }
  
  /**
   * Info 日志快捷方法
   */
  info(message: string, context?: LogContext): void {
    this.log(LogLevel.INFO, LogCategory.REQUEST, message, context);
  }
  
  /**
   * Warn 日志快捷方法
   */
  warn(message: string, context?: LogContext): void {
    this.log(LogLevel.WARN, LogCategory.ERROR, message, context);
  }
  
  /**
   * Error 日志快捷方法
   */
  error(message: string, context?: LogContext): void {
    this.log(LogLevel.ERROR, LogCategory.ERROR, message, context);
  }

  /**
   * 清理敏感头信息
   */
  private sanitizeHeaders(headers: any): any {
    const sensitive = ['authorization', 'cookie', 'x-api-key'];
    const sanitized = { ...headers };

    for (const key of sensitive) {
      if (sanitized[key]) {
        sanitized[key] = '[REDACTED]';
      }
    }

    return sanitized;
  }

  /**
   * 清理敏感数据
   */
  private sanitizeBody(body: any): any {
    if (!body || typeof body !== 'object') {
      return body;
    }

    const sensitive = ['password', 'token', 'secret', 'api_key'];
    const sanitized = { ...body };

    for (const key of Object.keys(sanitized)) {
      if (sensitive.some(s => key.toLowerCase().includes(s))) {
        sanitized[key] = '[REDACTED]';
      }
    }

    return sanitized;
  }

  /**
   * 清理数据（限制大小）
   */
  private sanitizeData(data: any): any {
    if (!data) return data;

    const str = JSON.stringify(data);
    if (str.length > 1000) {
      return `[TRUNCATED: ${str.length} chars]`;
    }

    return data;
  }

  /**
   * 获取性能指标
   */
  getMetrics(): {
    totalRequests: number;
    errorCount: number;
    avgResponseTime: number;
  } {
    // 这里应该从实际的指标存储中获取
    // 现在返回模拟数据
    return {
      totalRequests: 0,
      errorCount: 0,
      avgResponseTime: 0
    };
  }
}

// 单例实例
export const logger = new Logger();// Test comment

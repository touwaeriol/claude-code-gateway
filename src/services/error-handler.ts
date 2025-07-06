/**
 * 自定义错误类
 */

export class AppError extends Error {
  constructor(
    public message: string,
    public statusCode: number = 500,
    public code?: string,
    public details?: any
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 400, 'validation_error', details);
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication required') {
    super(message, 401, 'authentication_error');
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = 'Permission denied') {
    super(message, 403, 'authorization_error');
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} not found`, 404, 'not_found');
  }
}

export class RateLimitError extends AppError {
  constructor(message: string = 'Rate limit exceeded') {
    super(message, 429, 'rate_limit_exceeded');
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(service: string) {
    super(`Service ${service} is unavailable`, 503, 'service_unavailable');
  }
}

/**
 * 错误处理器
 */
export class ErrorHandler {
  /**
   * 处理错误并返回适当的响应
   */
  static handle(error: any): {
    statusCode: number;
    error: {
      message: string;
      type: string;
      code?: string;
      details?: any;
    };
  } {
    // 处理自定义错误
    if (error instanceof AppError) {
      return {
        statusCode: error.statusCode,
        error: {
          message: this.sanitizeMessage(error.message),
          type: error.code || 'api_error',
          code: error.code,
          details: error.details
        }
      };
    }

    // 处理验证错误
    if (error.name === 'ValidationError') {
      return {
        statusCode: 400,
        error: {
          message: 'Validation failed',
          type: 'validation_error',
          details: error.errors
        }
      };
    }

    // 处理 Claude SDK 错误
    if (error.name === 'ClaudeError' || error.message?.includes('Claude')) {
      return {
        statusCode: 502,
        error: {
          message: 'Claude service error',
          type: 'claude_error',
          details: this.sanitizeMessage(error.message)
        }
      };
    }

    // 默认错误
    return {
      statusCode: 500,
      error: {
        message: process.env.NODE_ENV === 'production' 
          ? 'Internal server error' 
          : error.message,
        type: 'internal_error'
      }
    };
  }

  /**
   * 清理错误消息中的敏感信息
   */
  private static sanitizeMessage(message: string): string {
    // 移除文件路径
    message = message.replace(/\/[\w\/\-\.]+/g, '[PATH]');
    
    // 移除 IP 地址
    message = message.replace(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/g, '[IP]');
    
    // 移除端口号
    message = message.replace(/:\d{4,5}/g, ':[PORT]');
    
    // 移除可能的密钥
    message = message.replace(/[a-zA-Z0-9]{32,}/g, '[KEY]');
    
    return message;
  }

  /**
   * 判断是否是可重试的错误
   */
  static isRetryable(error: any): boolean {
    // 网络错误
    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      return true;
    }

    // 5xx 错误
    if (error instanceof AppError && error.statusCode >= 500) {
      return true;
    }

    // 速率限制
    if (error instanceof RateLimitError) {
      return true;
    }

    return false;
  }

  /**
   * 获取重试延迟时间（毫秒）
   */
  static getRetryDelay(attemptNumber: number): number {
    // 指数退避：1s, 2s, 4s, 8s...
    return Math.min(1000 * Math.pow(2, attemptNumber - 1), 30000);
  }
}
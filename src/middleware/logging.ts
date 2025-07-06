import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../services/logger';

// 扩展 Request 接口以包含自定义属性
declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      startTime?: number;
    }
  }
}

/**
 * 请求日志中间件
 */
export function requestLogging(req: Request, res: Response, next: NextFunction): void {
  // 生成请求 ID
  req.requestId = req.headers['x-request-id'] as string || uuidv4();
  req.startTime = Date.now();

  // 记录请求
  logger.logRequest(req, req.requestId);

  // 拦截响应
  const originalSend = res.send;
  res.send = function(data: any): Response {
    res.send = originalSend;
    
    // 计算响应时间
    const responseTime = Date.now() - (req.startTime || 0);
    
    // 记录响应
    logger.logResponse(req.requestId!, res.statusCode, responseTime);
    
    // 添加响应头
    res.setHeader('X-Request-ID', req.requestId!);
    res.setHeader('X-Response-Time', `${responseTime}ms`);
    
    return res.send(data);
  };

  next();
}

/**
 * 错误处理中间件
 */
export function errorHandling(err: Error, req: Request, res: Response, next: NextFunction): void {
  // 记录错误
  logger.logError(err, {
    requestId: req.requestId,
    method: req.method,
    path: req.path,
    statusCode: res.statusCode
  });

  // 检查响应是否已经发送
  if (res.headersSent) {
    return next(err);
  }

  // 确定状态码
  const statusCode = res.statusCode !== 200 ? res.statusCode : 500;

  // 发送错误响应
  res.status(statusCode).json({
    error: {
      message: process.env.NODE_ENV === 'production' 
        ? 'Internal server error' 
        : err.message,
      type: 'api_error',
      request_id: req.requestId
    }
  });
}

/**
 * 404 处理中间件
 */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: {
      message: `Route ${req.method} ${req.path} not found`,
      type: 'not_found',
      request_id: req.requestId
    }
  });
}
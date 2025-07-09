import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/unified-logger.js';

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
  
  // 为响应添加开始时间
  (res as any).startTime = req.startTime;

  // 记录请求
  logger.access(`${req.method} ${req.path}`, {
    requestId: req.requestId,
    headers: req.headers,
    body: req.body,
    query: req.query
  });

  // 拦截响应
  const originalSend = res.send;
  const originalJson = res.json;
  const originalWrite = res.write;
  const originalEnd = res.end;
  
  // 用于收集响应数据
  let responseData: any = null;
  
  // 拦截 json 方法
  res.json = function(data: any): Response {
    responseData = data;
    res.json = originalJson;
    return originalJson.call(this, data);
  };
  
  // 拦截 send 方法
  res.send = function(data: any): Response {
    res.send = originalSend;
    
    // 计算响应时间
    const responseTime = Date.now() - (req.startTime || 0);
    
    // 记录响应
    logger.access(`${req.method} ${req.path} ${res.statusCode}`, {
      requestId: req.requestId,
      statusCode: res.statusCode,
      responseTime,
      responseData: responseData || data
    });
    
    // 添加响应头
    res.setHeader('X-Request-ID', req.requestId!);
    res.setHeader('X-Response-Time', `${responseTime}ms`);
    
    return res.send(data);
  };
  
  // 拦截流式响应
  let chunks: Buffer[] = [];
  
  res.write = function(chunk: any, ...args: any[]): boolean {
    if (chunk) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      // 记录流式数据块
      logger.debug('流式数据块', {
        requestId: req.requestId,
        chunkType: 'write',
        size: chunks.length
      });
    }
    return originalWrite.apply(res, [chunk, ...args] as any);
  };
  
  res.end = function(chunk?: any, ...args: any[]): Response {
    if (chunk) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      logger.debug('流式数据结束', {
        requestId: req.requestId,
        chunkType: 'end',
        size: chunks.length
      });
    }
    
    // 如果是流式响应，记录完整响应
    if (chunks.length > 0 && !responseData) {
      const fullResponse = Buffer.concat(chunks).toString();
      logger.access(`${req.method} ${req.path} ${res.statusCode} [流式响应]`, {
        requestId: req.requestId,
        responseData: fullResponse
      });
    }
    
    return originalEnd.apply(res, [chunk, ...args] as any);
  };

  next();
}

/**
 * 错误处理中间件
 */
export function errorHandling(err: Error, req: Request, res: Response, next: NextFunction): void {
  // 记录错误
  logger.error('请求处理错误', {
    requestId: req.requestId,
    method: req.method,
    path: req.path,
    statusCode: res.statusCode,
    error: {
      message: err.message,
      stack: err.stack
    }
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
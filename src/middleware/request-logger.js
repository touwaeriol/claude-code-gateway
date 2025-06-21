import { logger } from '../utils/logger.js';

let requestCounter = 0;

export function requestLogger(req, res, next) {
  const requestId = `req-${Date.now()}-${++requestCounter}`;
  const startTime = Date.now();
  
  // 添加请求 ID 到请求对象
  req.requestId = requestId;
  
  // 记录请求
  logger.info(`[${requestId}] ${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('user-agent')
  });
  
  // 记录请求体（排除敏感信息）
  if (req.body && Object.keys(req.body).length > 0) {
    const sanitizedBody = { ...req.body };
    if (sanitizedBody.messages) {
      sanitizedBody.messages = `[${sanitizedBody.messages.length} messages]`;
    }
    logger.debug(`[${requestId}] Request body:`, sanitizedBody);
  }
  
  // 拦截响应完成事件
  const originalSend = res.send;
  res.send = function(data) {
    res.send = originalSend;
    
    const duration = Date.now() - startTime;
    logger.info(`[${requestId}] ${res.statusCode} - ${duration}ms`);
    
    return res.send(data);
  };
  
  next();
}
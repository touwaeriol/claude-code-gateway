import { logger } from '../utils/logger.js';

export function errorHandler(err, req, res, next) {
  // 记录错误
  logger.error('Unhandled error:', {
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    body: req.body
  });

  // 如果响应已经发送，不再处理
  if (res.headersSent) {
    return next(err);
  }

  // 确定状态码
  const statusCode = err.statusCode || err.status || 500;

  // 构建错误响应
  const errorResponse = {
    error: {
      message: err.message || 'Internal server error',
      type: err.type || 'api_error',
      code: err.code || null
    }
  };

  // 在开发环境中包含堆栈信息
  if (process.env.NODE_ENV === 'development') {
    errorResponse.error.stack = err.stack;
  }

  res.status(statusCode).json(errorResponse);
}

export function notFoundHandler(req, res) {
  res.status(404).json({
    error: {
      message: `The requested endpoint ${req.method} ${req.path} does not exist`,
      type: 'not_found_error',
      code: 'endpoint_not_found'
    }
  });
}
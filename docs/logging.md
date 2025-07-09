# 日志系统使用指南

## 概述

本项目使用统一的日志系统，所有日志会同时输出到控制台和文件。

## 日志文件

所有日志文件存储在 `logs/` 目录下：

- `app.log` - 主应用日志
- `access.log` - HTTP 访问日志
- `claude-sdk.log` - Claude SDK 交互日志
- `request.log` - 请求详细日志
- `error.log` - 错误日志

## 使用方法

### 1. 导入日志器

```typescript
import { logger } from './utils/unified-logger.js';
```

### 2. 基础日志方法

```typescript
// 调试信息（仅在 LOG_LEVEL=debug 时记录）
logger.debug('调试信息', { detail: 'some data' });

// 一般信息
logger.info('操作成功');

// 警告
logger.warn('内存使用率过高', { usage: '85%' });

// 错误
logger.error('操作失败', new Error('连接超时'));
```

### 3. 特定类型日志

```typescript
// HTTP 访问日志
logger.access('GET /api/users 200', {
    requestId: 'req-123',
    responseTime: 234
});

// Claude SDK 日志
logger.claudeSDK('SDK 查询开始', {
    sessionId: 'session-456',
    model: 'claude-3-sonnet'
});

// 请求日志
logger.request('收到聊天请求', {
    model: 'gpt-4',
    messages: 5
});
```

### 4. Console 日志自动记录

所有 `console.log`、`console.error` 等调用会自动记录到日志文件：

```typescript
console.log('这条消息会同时输出到控制台和 app.log');
console.error('错误信息会被记录到 app.log 和 error.log');
```

## 环境变量

通过环境变量控制日志级别：

```bash
# 设置日志级别（debug, info, warn, error）
LOG_LEVEL=debug npm start

# 默认为 info 级别
npm start
```

## 日志格式

### 控制台输出（带颜色）
```
[2024-01-01T12:00:00.000Z] [INFO] [ModuleName] 操作成功 { userId: 123 }
```

### 文件输出（纯文本）
```
[2024-01-01T12:00:00.000Z] [INFO] [ModuleName] 操作成功 { userId: 123 }
{"timestamp":"2024-01-01T12:00:00.000Z","level":"info","module":"ModuleName","message":"操作成功","data":{"userId":123}}
```

## 最佳实践

1. **使用合适的日志级别**
   - `debug`: 详细的调试信息
   - `info`: 重要的业务流程信息
   - `warn`: 警告但不影响功能
   - `error`: 错误和异常

2. **结构化数据**
   ```typescript
   // 好的做法
   logger.info('用户登录', { userId: 123, ip: '127.0.0.1' });
   
   // 避免
   logger.info(`用户 123 从 127.0.0.1 登录`);
   ```

3. **错误日志**
   ```typescript
   try {
       // 业务逻辑
   } catch (error) {
       logger.error('操作失败', {
           error: error instanceof Error ? {
               message: error.message,
               stack: error.stack
           } : error,
           context: { userId, action: 'updateProfile' }
       });
   }
   ```

4. **性能考虑**
   - 避免在循环中记录大量日志
   - 使用 `debug` 级别记录详细信息
   - 生产环境使用 `info` 或更高级别
import { logger } from './unified-logger.js';

/**
 * 日志使用示例
 */
export function loggerExample() {
    // 基础日志方法
    logger.debug('调试信息', { detail: 'some debug data' });
    logger.info('一般信息');
    logger.warn('警告信息');
    logger.error('错误信息', new Error('示例错误'));
    
    // 特定类型的日志方法
    logger.access('GET /v1/chat/completions', {
        ip: '127.0.0.1',
        userAgent: 'Mozilla/5.0',
        responseTime: 234
    });
    
    logger.claudeSDK('SDK 查询开始', {
        sessionId: 'test-123',
        model: 'claude-3-sonnet',
        messageCount: 5
    });
    
    // request 方法已移除，普通日志使用 info
    logger.info('收到聊天请求', {
        requestId: 'req-456',
        model: 'gpt-4',
        messages: 3
    });
    
    // console.log 也会被记录到文件
    console.log('这条消息会同时输出到控制台和日志文件');
    console.error('错误信息也会被记录');
}

/**
 * 在其他模块中使用
 */
export class ExampleService {
    private logger = logger;
    
    doSomething() {
        this.logger.info('执行某个操作');
        
        try {
            // 业务逻辑
            this.logger.claudeSDK('调用 Claude SDK', { action: 'query' });
        } catch (error) {
            this.logger.error('操作失败', error);
        }
    }
}
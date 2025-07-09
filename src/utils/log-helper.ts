import { logger, LogLevel, LogCategory } from '../services/logger.js';

/**
 * 日志工具类 - 提供简化的日志记录方法
 */
export class LogHelper {
    /**
     * 记录查询开始
     */
    static logQueryStart(sessionId: string, options?: any): void {
        console.log(`执行查询: ${sessionId}`);
        if (options) {
            console.log('查询选项:', JSON.stringify(options, null, 2));
        }
    }

    /**
     * 记录收到的消息
     */
    static logMessage(message: any): void {
        console.log('收到消息:', JSON.stringify(message));
    }

    /**
     * 记录错误详情
     */
    static logError(error: any, context: any): void {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('错误详情:', {
            errorMessage,
            errorType: error?.constructor?.name,
            ...context
        });
    }

    /**
     * 记录会话结束
     */
    static logSessionEnd(sessionId: string): void {
        console.log(`会话 ${sessionId} 结束，清理资源`);
    }

    /**
     * 记录请求信息
     */
    static logRequest(category: LogCategory, message: string, data: any): void {
        logger.log(LogLevel.INFO, category, message, data);
    }

    /**
     * 记录警告
     */
    static logWarning(message: string, data?: any): void {
        console.warn(message, data);
    }

    /**
     * 记录系统信息
     */
    static logSystem(message: string, data?: any): void {
        logger.log(LogLevel.INFO, LogCategory.SYSTEM, message, data);
    }
}
import fs from 'fs';
import path from 'path';
import util from 'util';
import { LOG_CONFIG } from '../config/constants.js';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
    timestamp: string;
    level: LogLevel;
    module: string;
    message: string;
    data?: any;
}

/**
 * 统一的日志记录器
 * logger 的日志只输出到文件，不输出到控制台
 */
export class UnifiedLogger {
    private logStream: fs.WriteStream;
    private logPath: string;
    private module: string;
    private logLevel: LogLevel;
    private outputToConsole: boolean;
    
    constructor(module: string, logFileName: string = 'app.log', outputToConsole: boolean = false) {
        this.module = module;
        this.logLevel = LOG_CONFIG.LOG_LEVEL;
        this.outputToConsole = outputToConsole;
        
        // 创建 logs 目录
        const logsDir = path.join(process.cwd(), 'logs');
        if (!fs.existsSync(logsDir)) {
            fs.mkdirSync(logsDir, { recursive: true });
        }
        
        // 创建日志文件
        this.logPath = path.join(logsDir, logFileName);
        this.logStream = fs.createWriteStream(this.logPath, { 
            flags: 'a',
            encoding: 'utf8'
        });
    }
    
    /**
     * 判断是否应该记录该级别的日志
     */
    private shouldLog(level: LogLevel): boolean {
        const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
        const currentLevelIndex = levels.indexOf(this.logLevel);
        const targetLevelIndex = levels.indexOf(level);
        return targetLevelIndex >= currentLevelIndex;
    }
    
    /**
     * 格式化日志消息
     */
    private formatMessage(level: LogLevel, message: string, data?: any): string {
        const timestamp = new Date().toISOString();
        const prefix = `[${timestamp}] [${level.toUpperCase()}] [${this.module}]`;
        
        let formattedMessage = `${prefix} ${message}`;
        
        if (data !== undefined) {
            if (typeof data === 'object') {
                formattedMessage += ' ' + util.inspect(data, { 
                    depth: 3, 
                    colors: false,
                    compact: true 
                });
            } else {
                formattedMessage += ' ' + String(data);
            }
        }
        
        return formattedMessage;
    }
    
    /**
     * 格式化控制台输出（带颜色）
     */
    private formatConsoleMessage(level: LogLevel, message: string, data?: any): string {
        const colors = {
            debug: '\x1b[36m',   // 青色
            info: '\x1b[32m',    // 绿色
            warn: '\x1b[33m',    // 黄色
            error: '\x1b[31m'    // 红色
        };
        const reset = '\x1b[0m';
        const color = colors[level];
        
        const timestamp = new Date().toISOString();
        const prefix = `${color}[${timestamp}] [${level.toUpperCase()}] [${this.module}]${reset}`;
        
        let formattedMessage = `${prefix} ${message}`;
        
        if (data !== undefined) {
            if (typeof data === 'object') {
                formattedMessage += ' ' + util.inspect(data, { 
                    depth: 3, 
                    colors: true,
                    compact: true 
                });
            } else {
                formattedMessage += ' ' + String(data);
            }
        }
        
        return formattedMessage;
    }
    
    /**
     * 写入日志
     */
    private log(level: LogLevel, message: string, data?: any): void {
        if (!this.shouldLog(level)) {
            return;
        }
        
        // 写入文件
        const logEntry: LogEntry = {
            timestamp: new Date().toISOString(),
            level,
            module: this.module,
            message,
            data
        };
        this.logStream.write(JSON.stringify(logEntry) + '\n');
        
        // 只有在 outputToConsole 为 true 时才输出到控制台（用于 console 重写）
        if (this.outputToConsole) {
            const consoleMessage = this.formatConsoleMessage(level, message, data);
            switch (level) {
                case 'debug':
                case 'info':
                    console.log(consoleMessage);
                    break;
                case 'warn':
                    console.warn(consoleMessage);
                    break;
                case 'error':
                    console.error(consoleMessage);
                    break;
            }
        }
    }
    
    debug(message: string, data?: any): void {
        this.log('debug', message, data);
    }
    
    info(message: string, data?: any): void {
        this.log('info', message, data);
    }
    
    warn(message: string, data?: any): void {
        this.log('warn', message, data);
    }
    
    error(message: string, data?: any): void {
        this.log('error', message, data);
    }
    
    /**
     * 兼容 console.log 的方法
     */
    consoleLog(...args: any[]): void {
        const message = args.map(arg => 
            typeof arg === 'object' ? util.inspect(arg, { depth: 3 }) : String(arg)
        ).join(' ');
        this.info(message);
    }
    
    /**
     * 关闭日志流
     */
    close(): void {
        this.logStream.end();
    }
}

/**
 * 创建模块专用的日志记录器
 */
export function createLogger(module: string): UnifiedLogger {
    return new UnifiedLogger(module);
}

/**
 * 扩展的日志记录器，支持特定类型的日志
 */
export class ExtendedLogger extends UnifiedLogger {
    private accessLogger: UnifiedLogger;
    private claudeSDKLogger: UnifiedLogger;
    private errorLogger: UnifiedLogger;
    
    constructor() {
        super('App');
        // 只保留必要的日志文件
        this.accessLogger = new UnifiedLogger('Access', 'access.log');
        this.claudeSDKLogger = new UnifiedLogger('ClaudeSDK', 'claude-sdk.log');
        this.errorLogger = new UnifiedLogger('Error', 'error.log');
    }
    
    /**
     * 记录 HTTP 访问日志
     */
    access(message: string, data?: any): void {
        this.accessLogger.info(message, data);
    }
    
    /**
     * 记录 Claude SDK 相关日志
     */
    claudeSDK(message: string, data?: any): void {
        this.claudeSDKLogger.info(message, data);
    }
    
    /**
     * 记录错误日志（会同时写入 error.log 和 app.log）
     */
    error(message: string, data?: any): void {
        super.error(message, data);
        this.errorLogger.error(message, data);
    }
    
    /**
     * 关闭所有日志流
     */
    close(): void {
        super.close();
        this.accessLogger.close();
        this.claudeSDKLogger.close();
        this.errorLogger.close();
    }
}

/**
 * 全局默认日志记录器
 */
export const logger = new ExtendedLogger();
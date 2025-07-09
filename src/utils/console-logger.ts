import fs from 'fs';
import path from 'path';
import { LOG_CONFIG } from '../config/constants.js';

/**
 * 重写 console 方法，使其自动记录到日志文件
 */
export class ConsoleLogger {
    private static appLogStream: fs.WriteStream;
    private static originalConsole = {
        log: console.log,
        info: console.info,
        warn: console.warn,
        error: console.error,
        debug: console.debug
    };
    
    /**
     * 判断是否应该记录该级别的日志
     */
    private static shouldLog(level: string): boolean {
        const levels = ['debug', 'info', 'warn', 'error'];
        const currentLevelIndex = levels.indexOf(LOG_CONFIG.LOG_LEVEL);
        const targetLevelIndex = levels.indexOf(level);
        return targetLevelIndex >= currentLevelIndex;
    }
    
    /**
     * 初始化日志流
     */
    private static initLogStream(): void {
        if (!this.appLogStream) {
            const logsDir = path.join(process.cwd(), 'logs');
            if (!fs.existsSync(logsDir)) {
                fs.mkdirSync(logsDir, { recursive: true });
            }
            // 写入 app.log 而不是 console.log
            const logPath = path.join(logsDir, 'app.log');
            this.appLogStream = fs.createWriteStream(logPath, { 
                flags: 'a',
                encoding: 'utf8'
            });
        }
    }
    
    /**
     * 直接写入日志文件（避免递归）
     */
    private static writeLog(level: string, message: string): void {
        // 根据日志级别过滤
        if (!this.shouldLog(level)) {
            return;
        }
        
        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp,
            level,
            module: 'Console',
            message
        };
        this.appLogStream.write(JSON.stringify(logEntry) + '\n');
    }
    
    /**
     * 启用 console 日志记录
     */
    static enable(): void {
        this.initLogStream();
        
        // 重写 console.log - 使用 debug 级别
        console.log = (...args: any[]) => {
            this.originalConsole.log(...args);
            this.writeLog('debug', this.formatArgs(args));
        };
        
        // 重写 console.info
        console.info = (...args: any[]) => {
            this.originalConsole.info(...args);
            this.writeLog('info', this.formatArgs(args));
        };
        
        // 重写 console.warn
        console.warn = (...args: any[]) => {
            this.originalConsole.warn(...args);
            this.writeLog('warn', this.formatArgs(args));
        };
        
        // 重写 console.error
        console.error = (...args: any[]) => {
            this.originalConsole.error(...args);
            this.writeLog('error', this.formatArgs(args));
        };
        
        // 重写 console.debug
        console.debug = (...args: any[]) => {
            this.originalConsole.debug(...args);
            this.writeLog('debug', this.formatArgs(args));
        };
        
        this.originalConsole.log('Console 日志记录已启用');
    }
    
    /**
     * 禁用 console 日志记录，恢复原始方法
     */
    static disable(): void {
        console.log = this.originalConsole.log;
        console.info = this.originalConsole.info;
        console.warn = this.originalConsole.warn;
        console.error = this.originalConsole.error;
        console.debug = this.originalConsole.debug;
        
        this.originalConsole.log('Console 日志记录已禁用');
    }
    
    /**
     * 格式化参数为字符串
     */
    private static formatArgs(args: any[]): string {
        return args.map(arg => {
            if (typeof arg === 'object') {
                try {
                    return JSON.stringify(arg, null, 2);
                } catch (e) {
                    return String(arg);
                }
            }
            return String(arg);
        }).join(' ');
    }
}
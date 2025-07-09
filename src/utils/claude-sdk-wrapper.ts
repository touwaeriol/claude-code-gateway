import { spawn } from 'child_process';
import { SDKMessage } from '../types/claude-code-types.js';

/**
 * 包装 Claude Code SDK 的执行，捕获进程输出
 */
export class ClaudeSDKWrapper {
    /**
     * 执行 Claude Code SDK 查询并捕获输出
     */
    static async *executeWithLogging(
        queryFunction: () => AsyncGenerator<SDKMessage>,
        sessionId: string
    ): AsyncGenerator<SDKMessage> {
        console.log(`[ClaudeSDKWrapper] 开始执行查询 - sessionId: ${sessionId}`);
        
        try {
            // 捕获 SDK 进程的标准输出和错误输出
            const originalStdoutWrite = process.stdout.write;
            const originalStderrWrite = process.stderr.write;
            
            const stdoutBuffer: string[] = [];
            const stderrBuffer: string[] = [];
            
            // 重定向输出
            process.stdout.write = function(chunk: any, encoding?: any, callback?: any) {
                const str = chunk.toString();
                stdoutBuffer.push(str);
                console.log(`[Claude SDK STDOUT] ${str.trim()}`);
                return originalStdoutWrite.call(process.stdout, chunk, encoding, callback);
            } as any;
            
            process.stderr.write = function(chunk: any, encoding?: any, callback?: any) {
                const str = chunk.toString();
                stderrBuffer.push(str);
                console.error(`[Claude SDK STDERR] ${str.trim()}`);
                return originalStderrWrite.call(process.stderr, chunk, encoding, callback);
            } as any;
            
            // 监听进程退出事件
            const exitHandler = (code: number | null) => {
                console.error(`[ClaudeSDKWrapper] Claude Code 进程退出 - code: ${code}, sessionId: ${sessionId}`);
                if (stdoutBuffer.length > 0) {
                    console.error(`[ClaudeSDKWrapper] 标准输出:`, stdoutBuffer.join(''));
                }
                if (stderrBuffer.length > 0) {
                    console.error(`[ClaudeSDKWrapper] 错误输出:`, stderrBuffer.join(''));
                }
            };
            
            process.on('exit', exitHandler);
            
            try {
                // 执行查询
                for await (const message of queryFunction()) {
                    yield message;
                }
            } finally {
                // 恢复原始输出
                process.stdout.write = originalStdoutWrite;
                process.stderr.write = originalStderrWrite;
                process.removeListener('exit', exitHandler);
                
                // 输出最终的日志
                if (stdoutBuffer.length > 0) {
                    console.log(`[ClaudeSDKWrapper] 最终标准输出 - sessionId: ${sessionId}:\n`, stdoutBuffer.join(''));
                }
                if (stderrBuffer.length > 0) {
                    console.error(`[ClaudeSDKWrapper] 最终错误输出 - sessionId: ${sessionId}:\n`, stderrBuffer.join(''));
                }
            }
        } catch (error) {
            console.error(`[ClaudeSDKWrapper] 执行错误 - sessionId: ${sessionId}:`, error);
            throw error;
        }
    }
    
    /**
     * 监控子进程
     */
    static monitorChildProcesses(sessionId: string): void {
        const originalSpawn = spawn;
        
        // 拦截 spawn 调用
        (global as any).spawn = function(command: string, args?: readonly string[], options?: any) {
            console.log(`[ClaudeSDKWrapper] 启动子进程 - sessionId: ${sessionId}, command:`, command, args);
            
            const child = originalSpawn(command, args || [], options || {});
            
            child.stdout?.on('data', (data) => {
                console.log(`[Claude SDK 子进程 STDOUT - ${sessionId}]`, data.toString().trim());
            });
            
            child.stderr?.on('data', (data) => {
                console.error(`[Claude SDK 子进程 STDERR - ${sessionId}]`, data.toString().trim());
            });
            
            child.on('exit', (code, signal) => {
                console.error(`[Claude SDK 子进程退出 - ${sessionId}] code: ${code}, signal: ${signal}`);
            });
            
            child.on('error', (error) => {
                console.error(`[Claude SDK 子进程错误 - ${sessionId}]`, error);
            });
            
            return child;
        };
    }
}
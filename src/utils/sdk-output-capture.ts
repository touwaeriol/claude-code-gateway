import { spawn, ChildProcess } from 'child_process';
import { Readable } from 'stream';
import * as childProcess from 'child_process';

/**
 * SDK 输出捕获器 - 捕获所有原始输出
 */
export class SDKOutputCapture {
    private stdout: string = '';
    private stderr: string = '';
    private jsonLines: any[] = [];
    
    /**
     * 拦截并捕获子进程的所有输出
     */
    static interceptSpawn(): void {
        // 暂时禁用，因为 ES 模块限制
        console.log('SDK 输出捕获已启用（注：由于 ES 模块限制，子进程拦截暂不可用）');
    }
    
    /**
     * 附加到进程并捕获输出
     */
    private attachToProcess(child: ChildProcess, command: string): void {
        let stdoutBuffer = '';
        let stderrBuffer = '';
        
        // 捕获标准输出
        if (child.stdout) {
            child.stdout.on('data', (data: Buffer) => {
                const chunk = data.toString();
                stdoutBuffer += chunk;
                
                // 实时打印原始输出
                console.log('[SDK 原始输出]', chunk);
                
                // 尝试解析 JSON 行
                const lines = chunk.split('\n');
                for (const line of lines) {
                    if (line.trim()) {
                        try {
                            const json = JSON.parse(line);
                            console.log('[SDK JSON 消息]', JSON.stringify(json, null, 2));
                            this.jsonLines.push(json);
                        } catch (e) {
                            // 不是 JSON，可能是普通日志
                            if (line.length > 0) {
                                console.log('[SDK 文本输出]', line);
                            }
                        }
                    }
                }
            });
        }
        
        // 捕获错误输出
        if (child.stderr) {
            child.stderr.on('data', (data: Buffer) => {
                const chunk = data.toString();
                stderrBuffer += chunk;
                console.error('[SDK 错误输出]', chunk);
            });
        }
        
        // 进程退出时输出完整缓冲区
        child.on('exit', (code, signal) => {
            console.log('\n========== SDK 进程退出 ==========');
            console.log('退出码:', code);
            console.log('信号:', signal);
            
            if (stdoutBuffer) {
                console.log('\n完整标准输出:');
                console.log('---开始---');
                console.log(stdoutBuffer);
                console.log('---结束---');
            }
            
            if (stderrBuffer) {
                console.error('\n完整错误输出:');
                console.error('---开始---');
                console.error(stderrBuffer);
                console.error('---结束---');
            }
            
            if (this.jsonLines.length > 0) {
                console.log('\n捕获的 JSON 消息数:', this.jsonLines.length);
                console.log('最后一条消息:', JSON.stringify(this.jsonLines[this.jsonLines.length - 1], null, 2));
            }
            
            console.log('==================================\n');
        });
        
        // 处理错误
        child.on('error', (error) => {
            console.error('\n❌ 进程错误:', error);
        });
    }
    
    /**
     * 创建一个假的输出流用于调试
     */
    static createDebugStream(originalStream: Readable): Readable {
        const debugStream = new Readable({
            read() {}
        });
        
        originalStream.on('data', (chunk) => {
            console.log('[调试流] 接收数据:', chunk.toString());
            debugStream.push(chunk);
        });
        
        originalStream.on('end', () => {
            console.log('[调试流] 流结束');
            debugStream.push(null);
        });
        
        originalStream.on('error', (err) => {
            console.error('[调试流] 流错误:', err);
            debugStream.destroy(err);
        });
        
        return debugStream;
    }
}
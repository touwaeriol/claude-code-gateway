import { spawn, ChildProcess } from 'child_process';

/**
 * 进程监控器 - 捕获 Claude Code SDK 的输出
 */
export class ProcessMonitor {
    private static originalSpawn = spawn;
    private static activeProcesses = new Map<number, ChildProcess>();
    
    /**
     * 启用进程监控
     */
    static enable(): void {
        // 拦截 spawn 调用
        (global as any).spawn = (...args: any[]) => {
            const [command, cmdArgs] = args;
            
            console.log('\n========== 启动子进程 ==========');
            console.log('命令:', command);
            console.log('参数:', cmdArgs?.join(' ') || '无');
            console.log('时间:', new Date().toISOString());
            console.log('================================\n');
            
            const child = ProcessMonitor.originalSpawn.apply(null, args as any);
            
            if (child.pid) {
                ProcessMonitor.activeProcesses.set(child.pid, child);
            }
            
            // 捕获标准输出
            if (child.stdout) {
                child.stdout.on('data', (data) => {
                    const output = data.toString();
                    if (output.trim()) {
                        console.log(`[PID ${child.pid} STDOUT]`, output.trim());
                    }
                });
            }
            
            // 捕获错误输出
            if (child.stderr) {
                child.stderr.on('data', (data) => {
                    const output = data.toString();
                    if (output.trim()) {
                        console.error(`[PID ${child.pid} STDERR]`, output.trim());
                    }
                });
            }
            
            // 监听退出事件
            child.on('exit', (code, signal) => {
                console.error('\n========== 子进程退出 ==========');
                console.error(`PID: ${child.pid}`);
                console.error(`退出码: ${code}`);
                console.error(`信号: ${signal || '无'}`);
                console.error(`命令: ${command} ${cmdArgs?.join(' ') || ''}`);
                console.error('时间:', new Date().toISOString());
                console.error('================================\n');
                
                if (child.pid) {
                    ProcessMonitor.activeProcesses.delete(child.pid);
                }
            });
            
            // 监听错误事件
            child.on('error', (error) => {
                console.error('\n========== 子进程错误 ==========');
                console.error(`PID: ${child.pid}`);
                console.error(`错误:`, error);
                console.error(`命令: ${command} ${cmdArgs?.join(' ') || ''}`);
                console.error('================================\n');
            });
            
            return child;
        };
        
        // 捕获未处理的错误
        process.on('uncaughtException', (error) => {
            console.error('\n========== 未捕获的异常 ==========');
            console.error('错误:', error);
            console.error('活跃进程数:', ProcessMonitor.activeProcesses.size);
            console.error('===================================\n');
        });
        
        // 未处理的 Promise 拒绝已在 index.ts 中处理
        
        // 简化：仅监控全局进程事件
    }
    
    /**
     * 获取活跃进程信息
     */
    static getActiveProcesses(): number[] {
        return Array.from(ProcessMonitor.activeProcesses.keys());
    }
}
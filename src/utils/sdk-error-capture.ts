/**
 * 简单的 SDK 错误捕获器
 */
export class SDKErrorCapture {
    private static stderrBuffer: Map<string, string[]> = new Map();
    
    /**
     * 捕获进程错误输出
     */
    static captureProcessError(sessionId: string, error: Error): void {
        console.error('\n========== Claude Code SDK 错误 ==========');
        console.error(`会话ID: ${sessionId}`);
        console.error(`错误消息: ${error.message}`);
        console.error(`错误类型: ${error.constructor.name}`);
        
        // 如果是进程退出错误，尝试获取更多信息
        if (error.message.includes('exited with code')) {
            console.error('\nSDK 进程异常退出，可能的原因：');
            console.error('1. API Key 未设置或无效');
            console.error('2. 网络连接问题');
            console.error('3. Claude SDK 未正确安装');
            console.error('4. 权限问题');
            
            // 输出环境变量检查
            console.error('\n环境变量检查：');
            console.error(`ANTHROPIC_API_KEY: ${process.env.ANTHROPIC_API_KEY ? '已设置' : '未设置'}`);
            console.error(`NODE_ENV: ${process.env.NODE_ENV || 'development'}`);
            console.error(`PATH: ${process.env.PATH}`);
        }
        
        console.error('\n错误堆栈:');
        console.error(error.stack);
        console.error('==========================================\n');
    }
    
    /**
     * 记录 SDK 调用参数
     */
    static logSDKCall(sessionId: string, options: any): void {
        console.log('\n========== Claude SDK 调用参数 ==========');
        console.log(`会话ID: ${sessionId}`);
        console.log('参数:', JSON.stringify(options, null, 2));
        
        // 检查关键参数
        if (options.options) {
            const opts = options.options;
            console.log('\n关键配置:');
            console.log(`- 模型: ${opts.model}`);
            console.log(`- 最大轮次: ${opts.maxTurns}`);
            console.log(`- 禁用工具: ${opts.disallowedTools?.length || 0} 个`);
            console.log(`- MCP 服务器: ${Object.keys(opts.mcpServers || {}).join(', ')}`);
            console.log(`- 工作目录: ${opts.cwd}`);
        }
        
        console.log('==========================================\n');
    }
}
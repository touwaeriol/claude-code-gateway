import {query as originalQuery} from '@anthropic-ai/claude-code';
import {mkdtempSync, rmSync} from 'fs';
import {join} from 'path';
import {tmpdir} from 'os';

import {SDKMessage, CLAUDE_BUILTIN_TOOLS} from '../types/claude.js';
import {Tool, ExtendedChatMessage as ChatMessage} from '../types/openai-sdk.js';
import {SessionManager} from './session-manager.js';
import {ToolCallManager} from './tool-call-manager.js';
import {MessageStreamConverter} from './message-stream-converter.js';
import {LogHelper} from '../utils/log-helper.js';
import {ClaudeSDKWrapper} from '../utils/claude-sdk-wrapper.js';
import {SDKErrorCapture} from '../utils/sdk-error-capture.js';
import {logger} from '../utils/unified-logger.js';

export interface ClaudeServiceOptions {
    sessionId: string;
    model: string;
    tools?: Tool[];
    maxTurns?: number;
    abortController?: AbortController;
    customSystemPrompt?: string;
}

interface QueryOptions {
    sessionId: string;
    model: string;
    messages: ChatMessage[];
    abortController?: AbortController;
    customSystemPrompt?: string;
}

export class ClaudeService {
    constructor(
        private sessionManager: SessionManager,
        private port: number = 3000,
        private toolCallManager?: ToolCallManager
    ) {}

    /**
     * 查询 Claude
     */
    async query(messages: ChatMessage[], options: ClaudeServiceOptions): Promise<SDKMessage[]> {
        return this.queryWithSDK({
            sessionId: options.sessionId,
            model: options.model,
            messages,
            abortController: options.abortController,
            customSystemPrompt: options.customSystemPrompt
        });
    }


    /**
     * 使用 SDK 查询
     */
    async queryWithSDK(options: QueryOptions): Promise<SDKMessage[]> {
        const messages: SDKMessage[] = [];
        
        for await (const message of this.executeQuery(options)) {
            messages.push(message);
        }
        
        return messages;
    }

    /**
     * 使用 SDK 流式查询
     */
    async *queryWithSDKStream(options: QueryOptions): AsyncGenerator<SDKMessage> {
        for await (const message of this.executeQuery(options)) {
            // 只返回 assistant 类型的消息
            if (message.type === 'assistant') {
                yield message;
            }
        }
    }

    /**
     * 执行查询的核心逻辑
     */
    private async *executeQuery(options: QueryOptions): AsyncGenerator<SDKMessage> {
        LogHelper.logQueryStart(options.sessionId);
        
        const tempDir = mkdtempSync(join(tmpdir(), `claude-session-${options.sessionId}-`));

        try {
            // 获取会话信息
            const session = this.sessionManager.getSession(options.sessionId);
            
            // 构建查询配置
            const queryConfig = this.buildQueryConfig(options, tempDir);
            
            // 记录查询配置
            console.log(`[Claude SDK] 查询配置 - sessionId: ${options.sessionId}:`, JSON.stringify({
                model: queryConfig.model,
                maxTurns: queryConfig.maxTurns,
                disallowedTools: queryConfig.disallowedTools,
                mcpServers: Object.keys(queryConfig.mcpServers || {}),
                cwd: queryConfig.cwd,
                hasCustomSystemPrompt: !!queryConfig.customSystemPrompt,
                hasAppendSystemPrompt: !!queryConfig.appendSystemPrompt
            }, null, 2));
            
            // 创建消息流
            const messageConverter = new MessageStreamConverter(options.sessionId);
            const messageStream = messageConverter.convertToSDKStream(options.messages);

            // 执行查询 - 使用正确的参数格式
            const queryOptions = {
                prompt: messageStream,
                options: queryConfig
            };
            
            logger.claudeSDK('开始执行查询', { sessionId: options.sessionId });
            
            // 记录 SDK 调用参数
            SDKErrorCapture.logSDKCall(options.sessionId, queryOptions);
            
            // 记录查询到 SDK 日志
            logger.claudeSDK('查询启动', {
                sessionId: options.sessionId,
                model: options.model,
                messageCount: options.messages.length,
                maxTurns: queryConfig.maxTurns,
                hasCustomSystemPrompt: !!queryConfig.customSystemPrompt
            });
            
            // 添加 abort 事件监听
            if (queryConfig.abortController) {
                queryConfig.abortController.signal.addEventListener('abort', () => {
                    console.log(`[Claude SDK] AbortController 被触发 - sessionId: ${options.sessionId}`);
                    console.trace('AbortController 触发调用栈');
                });
            }
            
            let messageCount = 0;
            
            // 包装 query 函数以便调试
            const query = this.wrapQueryForDebugging(originalQuery);
            
            // 直接执行查询，不使用复杂的包装器
            for await (const message of query(queryOptions)) {
                messageCount++;
                logger.claudeSDK(`收到消息 #${messageCount}`, {
                    sessionId: options.sessionId,
                    type: message.type,
                    message
                });
                
                LogHelper.logMessage(message);
                
                // SDK 消息已经通过 logger.claudeSDK 记录
                
                yield message;
            }
            
            logger.claudeSDK('查询完成', {
                sessionId: options.sessionId,
                messageCount
            });
            
            // 查询完成已经通过 logger.claudeSDK 记录
        } catch (error) {
            // 特殊处理 Error 143 - 这是 SDK 的已知问题
            if (error instanceof Error && error.message.includes('process exited with code 143')) {
                logger.claudeSDK('忽略 Error 143 (SIGTERM)', { sessionId: options.sessionId });
                // 不抛出错误，让柢询正常完成
                return;
            }
            
            logger.error('[Claude SDK] 查询错误', {
                sessionId: options.sessionId,
                error: error instanceof Error ? {
                    message: error.message,
                    stack: error.stack
                } : error
            });
            
            // 使用错误捕获器记录详细信息
            if (error instanceof Error) {
                SDKErrorCapture.captureProcessError(options.sessionId, error);
            }
            
            LogHelper.logError(error, {
                sessionId: options.sessionId,
                model: options.model,
                messageCount: options.messages?.length,
                hasLongConversation: options.messages?.length > 50
            });
            
            // 错误已经通过 logger.error 记录
            throw error;
        } finally {
            logger.claudeSDK('清理资源', { sessionId: options.sessionId });
            
            // 清理事件已经通过 logger.claudeSDK 记录
            
            this.cleanup(options.sessionId, tempDir);
        }
    }

    /**
     * 构建查询配置
     */
    private buildQueryConfig(options: QueryOptions, tempDir: string) {
        const mcpServers = this.buildMcpServers(options.sessionId);
        const securityPrompt = this.buildSecurityPrompt(tempDir);

        return {
            model: options.model,
            maxTurns: 1,
            customSystemPrompt: options.customSystemPrompt,
            appendSystemPrompt: securityPrompt,
            disallowedTools: [...CLAUDE_BUILTIN_TOOLS],
            mcpServers,  // 恢复虚拟 MCP
            permissionPromptToolName: 'mcp__auth__approval_prompt',  // 恢复权限提示工具
            cwd: tempDir,
            abortController: options.abortController
        };
    }

    /**
     * 构建 MCP 服务器配置
     */
    private buildMcpServers(sessionId: string) {
        return {
            auth: {
                type: 'http' as const,
                url: `http://localhost:${this.port}/mcp/permission`,
                headers: { 'X-Session-ID': sessionId }
            },
            gateway: {
                type: 'http' as const,
                url: `http://localhost:${this.port}/mcp/gateway`,
                headers: { 'X-Session-ID': sessionId }
            }
        };
    }

    /**
     * 构建安全提示词
     */
    private buildSecurityPrompt(tempDir: string): string {
        return `
IMPORTANT SECURITY RESTRICTIONS:
1. You MUST ONLY use MCP tools that start with these prefixes: "mcp__auth__" or "mcp__gateway__".
2. You MUST NOT access, read, write, or interact with any files outside of: ${tempDir}
3. The working directory ${tempDir} is a clean, empty directory created for this session.
4. Any file operations should be performed within this temporary directory only.
5. Do not attempt to access the original cwd directory or any parent directories.`;
    }


    /**
     * 清理资源
     */
    private cleanup(sessionId: string, tempDir: string): void {
        LogHelper.logSessionEnd(sessionId);
        
        if (this.toolCallManager) {
            this.toolCallManager.cancelSessionToolCalls(sessionId);
        }
        
        rmSync(tempDir, { recursive: true, force: true });
    }
    
    /**
     * 包装 query 函数以便调试和捕获输出
     */
    private wrapQueryForDebugging(query: typeof originalQuery): typeof originalQuery {
        return async function* wrappedQuery(options: any) {
            console.debug()
            console.info
            console.log('[Claude SDK 调试] 调用参数:', JSON.stringify({
                model: options.options?.model,
                maxTurns: options.options?.maxTurns,
                mcpServers: options.options?.mcpServers ? Object.keys(options.options.mcpServers) : [],
                disallowedTools: options.options?.disallowedTools,
                permissionPromptToolName: options.options?.permissionPromptToolName
            }, null, 2));
            
            try {
                for await (const message of query(options)) {
                    console.log('[Claude SDK 调试] 原始消息:', JSON.stringify(message, null, 2));
                    yield message;
                }
            } catch (error) {
                console.error('[Claude SDK 调试] 错误:', error);
                throw error;
            }
        };
    }
}
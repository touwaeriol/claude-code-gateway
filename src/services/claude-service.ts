import {query} from '@anthropic-ai/claude-code';
import {mkdtempSync, rmSync} from 'fs';
import {join} from 'path';
import {tmpdir} from 'os';

import {SDKMessage, CLAUDE_BUILTIN_TOOLS} from '../types/claude';
import {Tool} from '../types/openai';
import {SessionManager} from './session-manager';
import {ToolCallManager} from './tool-call-manager';

export interface ClaudeServiceOptions {
    sessionId: string;
    model: string;
    tools?: Tool[];
    maxTurns?: number;
    abortController?: AbortController;
    customSystemPrompt?: string;
}

export class ClaudeService {
    constructor(
        private sessionManager: SessionManager,
        private port: number = 3000,
        private toolCallManager?: ToolCallManager // 添加 ToolCallManager 的引用
    ) {
    }

    /**
     * 查询 Claude（支持 SDK 和 CLI 两种方式）
     */
    async query(
        prompt: string,
        options: ClaudeServiceOptions
    ): Promise<SDKMessage[]> {
        return this.queryWithSDK({
            sessionId: options.sessionId,
            model: options.model,
            prompt,
            abortController: options.abortController,
            customSystemPrompt: options.customSystemPrompt
        });
    }

    /**
     * 流式查询 Claude
     */
    async *queryStream(
        prompt: string,
        options: ClaudeServiceOptions
    ): AsyncGenerator<SDKMessage> {
        yield* this.queryWithSDKStream({
            sessionId: options.sessionId,
            model: options.model,
            prompt,
            abortController: options.abortController,
            customSystemPrompt: options.customSystemPrompt
        });
    }

    /**
     * 使用 SDK 查询
     */
    async queryWithSDK(
        options: {
            sessionId: string;
            model: string;
            prompt: string;
            abortController?: AbortController;
            customSystemPrompt?: string;
        }
    ): Promise<SDKMessage[]> {
        console.log('queryWithSDK 开始执行');
        console.log('Options:', JSON.stringify(options, null, 2));

        // 为每个会话创建独立的临时目录（包含会话ID）
        const tempDir = mkdtempSync(join(tmpdir(), `claude-session-${options.sessionId}-`));
        console.log('创建临时工作目录:', tempDir);

        try {
            // 不处理内容，让 Claude 自己处理长提示

            const messages: SDKMessage[] = [];
            const session = this.sessionManager.getSession(options.sessionId);
            const allowedTools = session?.allowedTools || [];

            console.log('Session:', session);
            console.log('Allowed tools:', allowedTools);

            // 创建 MCP 服务器配置 - 使用项目内置的权限控制服务器
            const mcpServers = {
                // Auth 服务器 - 提供权限控制工具
                auth: {
                    type: 'http' as const,
                    url: `http://localhost:${this.port}/mcp/permission`,
                    headers: {
                        'X-Session-ID': options.sessionId
                    }
                },
                // Gateway 服务器 - 提供受控的业务工具
                gateway: {
                    type: 'http' as const,
                    url: `http://localhost:${this.port}/mcp/gateway`,
                    headers: {
                        'X-Session-ID': options.sessionId
                    }
                }
            };

            console.log('MCP Servers:', JSON.stringify(mcpServers, null, 2));

            // 创建安全限制提示词
            const securityPrompt = `
IMPORTANT SECURITY RESTRICTIONS:
1. You MUST ONLY use MCP tools that start with these prefixes: "mcp__auth__" or "mcp__gateway__". These are the only authorized MCP servers. DO NOT attempt to use any MCP tools with different prefixes.
2. You MUST NOT access, read, write, or interact with any files outside of the temporary working directory: ${tempDir}
3. The working directory ${tempDir} is a clean, empty directory created specifically for this session.
4. Any file operations should be performed within this temporary directory only.
5. Do not attempt to access the original cwd directory or any parent directories.

These restrictions are in place for security reasons and must be strictly followed.
`;

            try {
                console.log('开始调用 Claude Code SDK query...');

                for await (const message of query({
                    prompt: options.prompt,
                    abortController: options.abortController,
                    options: {
                        model: options.model,
                        maxTurns: 1,
                        // 使用组合后的系统提示词
                        customSystemPrompt: options.customSystemPrompt,
                        appendSystemPrompt: securityPrompt,
                        // 禁用所有内置工具
                        disallowedTools: [...CLAUDE_BUILTIN_TOOLS],
                        // 只使用我们控制的 MCP 服务器
                        mcpServers: mcpServers,
                        // 使用权限工具进行所有工具调用的验证
                        permissionPromptToolName: 'mcp__auth__approval_prompt',
                        // 使用临时目录作为工作目录
                        cwd: tempDir,
                        // 传递 AbortController 到 options
                        abortController: options.abortController
                    }
                })) {
                    console.log('收到消息:', JSON.stringify(message));

                    messages.push(message);
                }
            } catch (error) {
                console.error('SDK query 错误:', error);

                // 记录详细的错误信息用于调试
                const errorMessage = error instanceof Error ? error.message : String(error);
                console.error('Claude SDK 错误详情:', {
                    errorMessage,
                    errorType: error?.constructor?.name,
                    sessionId: options.sessionId,
                    model: options.model,
                    promptLength: options.prompt?.length,
                    hasLongPrompt: options.prompt?.length > 100000
                });

                // 直接抛出原始错误，让调用方处理
                throw error;
            }

            console.log('queryWithSDK 完成，消息数:', messages.length);
            return messages;
        } finally {
            // Claude Code 会话结束，清理对应的工具调用
            console.log(`Claude Code 会话 ${options.sessionId} 结束，清理相关工具调用`);
            if (this.toolCallManager) {
                this.toolCallManager.cancelSessionToolCalls(options.sessionId);
            }
            
            // 清理临时目录
            console.log('清理临时工作目录:', tempDir);
            rmSync(tempDir, {recursive: true, force: true});
        }
    }

    /**
     * 使用 SDK 流式查询
     */
    async *queryWithSDKStream(
        options: {
            sessionId: string;
            model: string;
            prompt: string;
            abortController?: AbortController;
            customSystemPrompt?: string;
        }
    ): AsyncGenerator<SDKMessage> {
        console.log('queryWithSDKStream 开始执行');
        console.log('Options:', JSON.stringify(options, null, 2));

        // 为每个会话创建独立的临时目录（包含会话ID）
        const tempDir = mkdtempSync(join(tmpdir(), `claude-session-${options.sessionId}-`));
        console.log('创建临时工作目录:', tempDir);

        try {
            const session = this.sessionManager.getSession(options.sessionId);
            const allowedTools = session?.allowedTools || [];

            console.log('Session:', session);
            console.log('Allowed tools:', allowedTools);

            // 创建 MCP 服务器配置 - 使用项目内置的权限控制服务器
            const mcpServers = {
                // Auth 服务器 - 提供权限控制工具
                auth: {
                    type: 'http' as const,
                    url: `http://localhost:${this.port}/mcp/permission`,
                    headers: {
                        'X-Session-ID': options.sessionId
                    }
                },
                // Gateway 服务器 - 提供受控的业务工具
                gateway: {
                    type: 'http' as const,
                    url: `http://localhost:${this.port}/mcp/gateway`,
                    headers: {
                        'X-Session-ID': options.sessionId
                    }
                }
            };

            console.log('MCP Servers:', JSON.stringify(mcpServers, null, 2));

            // 创建安全限制提示词
            const securityPrompt = `
IMPORTANT SECURITY RESTRICTIONS:
1. You MUST ONLY use MCP tools that start with these prefixes: "mcp__auth__" or "mcp__gateway__". These are the only authorized MCP servers. DO NOT attempt to use any MCP tools with different prefixes.
2. You MUST NOT access, read, write, or interact with any files outside of the temporary working directory: ${tempDir}
3. The working directory ${tempDir} is a clean, empty directory created specifically for this session.
4. Any file operations should be performed within this temporary directory only.
5. Do not attempt to access the original cwd directory or any parent directories.

These restrictions are in place for security reasons and must be strictly followed.
`;

            try {
                console.log('开始调用 Claude Code SDK query (流式)...');

                // 流式返回消息
                for await (const message of query({
                    prompt: options.prompt,
                    abortController: options.abortController,
                    options: {
                        model: options.model,
                        maxTurns: 1,
                        // 使用组合后的系统提示词
                        customSystemPrompt: options.customSystemPrompt,
                        appendSystemPrompt: securityPrompt,
                        // 禁用所有内置工具
                        disallowedTools: [...CLAUDE_BUILTIN_TOOLS],
                        // 只使用我们控制的 MCP 服务器
                        mcpServers: mcpServers,
                        // 使用权限工具进行所有工具调用的验证
                        permissionPromptToolName: 'mcp__auth__approval_prompt',
                        // 使用临时目录作为工作目录
                        cwd: tempDir,
                        // 传递 AbortController 到 options
                        abortController: options.abortController
                    }
                })) {
                    console.log('流式收到消息:', JSON.stringify(message));
                    
                    // 只返回 assistant 类型的消息
                    if (message.type === 'assistant') {
                        yield message;
                    }
                }
            } catch (error) {
                console.error('SDK stream query 错误:', error);

                // 记录详细的错误信息用于调试
                const errorMessage = error instanceof Error ? error.message : String(error);
                console.error('Claude SDK 流式错误详情:', {
                    errorMessage,
                    errorType: error?.constructor?.name,
                    sessionId: options.sessionId,
                    model: options.model,
                    promptLength: options.prompt?.length,
                    hasLongPrompt: options.prompt?.length > 100000
                });

                // 直接抛出原始错误，让调用方处理
                throw error;
            }

        } finally {
            // Claude Code 流式会话结束，清理对应的工具调用
            console.log(`Claude Code 流式会话 ${options.sessionId} 结束，清理相关工具调用`);
            if (this.toolCallManager) {
                this.toolCallManager.cancelSessionToolCalls(options.sessionId);
            }
            
            // 清理临时目录
            console.log('清理临时工作目录:', tempDir);
            rmSync(tempDir, {recursive: true, force: true});
        }
    }

}
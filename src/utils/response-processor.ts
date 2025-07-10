import { Response } from 'express';
import { ExtendedChatMessage, ExtendedChatMessage as ChatMessage, ChatCompletionResponse } from '../types/openai-sdk.js';
import { SDKMessage } from '../types/claude-code-types.js';
import { ClaudeSessionManager } from '../services/claude-session-manager.js';
import { MessageTrieCache } from '../services/message-trie-cache.js';
import { ResponseHelper } from './response-helper.js';
import { StreamWriter } from './stream-writer.js';
import { SequentialToolHandler } from './sequential-tool-handler.js';
import { SEQUENTIAL_TOOL_CONFIG } from '../config/sequential-tool-config.js';
import { v4 as uuidv4 } from 'uuid';

export interface ResponseOptions {
    conversationMessages: ChatMessage[];
    messages: ChatMessage[];
    model: string;
    claudeModel: string;
    sessionId: string;
    requestId: string;
    abortController: AbortController;
    customSystemPrompt?: string;
    isSequentialClient?: boolean;
}

/**
 * 响应处理器
 */
export class ResponseProcessor {
    private sequentialToolHandler: SequentialToolHandler;

    constructor(
        private claudeSessionManager: ClaudeSessionManager,
        private messageTrieCache: MessageTrieCache
    ) {
        this.sequentialToolHandler = new SequentialToolHandler(
            this.messageTrieCache,
            this.claudeSessionManager
        );
    }

    /**
     * 处理非流式响应
     */
    async processNonStream(options: ResponseOptions): Promise<ChatCompletionResponse> {
        console.log(`[ResponseProcessor] 开始处理非流式响应 - sessionId: ${options.sessionId}`);
        
        try {
            const messageStream = await this.claudeSessionManager.startSession(
                options.sessionId,
                options.conversationMessages,
                options.claudeModel,
                options.customSystemPrompt
            );

            console.log(`[ResponseProcessor] 消息流已创建 - sessionId: ${options.sessionId}`);

            const allToolCalls: any[] = [];
            const sdkMessages = await ResponseHelper.processMessageStream(
                messageStream,
                (toolCall) => {
                    console.log(`[ResponseProcessor] 收集工具调用: ${toolCall.function.name}`);
                    allToolCalls.push(toolCall);
                }
            );
            
            // 如果有工具调用，处理串行或并行模式
            if (allToolCalls.length > 0) {
                console.log(`[ResponseProcessor] 检测到 ${allToolCalls.length} 个工具调用`);
                
                // 检查是否需要串行处理
                if (this.sequentialToolHandler.needsSequentialProcessing(allToolCalls, options.isSequentialClient || false)) {
                    console.log(`[ResponseProcessor] 使用串行模式处理工具调用`);
                    
                    // 处理第一个工具调用
                    const result = await this.sequentialToolHandler.processSequentialToolCall(
                        options.sessionId,
                        options.messages,
                        allToolCalls,
                        0
                    );
                    
                    if (result.nextToolCall) {
                        // 创建只包含第一个工具调用的快照
                        const snapshot: ExtendedChatMessage[] = [
                            ...options.messages,
                            {
                                role: SEQUENTIAL_TOOL_CONFIG.MESSAGE_ROLES.ASSISTANT as 'assistant',
                                content: null,
                                tool_calls: [result.nextToolCall],
                                refusal: null
                            }
                        ];
                        this.messageTrieCache.createSnapshot(snapshot, options.sessionId);
                        
                        // 返回第一个工具调用
                        return ResponseHelper.createToolCallResponse(result.nextToolCall, options.model);
                    }
                } else {
                    console.log(`[ResponseProcessor] 使用并行模式处理工具调用`);
                    
                    // 创建包含所有工具调用的快照
                    const snapshot: ExtendedChatMessage[] = [
                        ...options.messages,
                        {
                            role: SEQUENTIAL_TOOL_CONFIG.MESSAGE_ROLES.ASSISTANT as 'assistant',
                            content: null,
                            tool_calls: allToolCalls,
                            refusal: null
                        }
                    ];
                    this.messageTrieCache.createSnapshot(snapshot, options.sessionId);
                }
            }

            console.log(`[ResponseProcessor] SDK消息处理完成 - sessionId: ${options.sessionId}, 消息数: ${sdkMessages.length}`);

            // 使用 convertToResponse 来正确处理所有消息（包括多个工具调用和混合消息）
            const response = this.convertToResponse(sdkMessages, options.model);
            
            // 记录响应类型
            const hasToolCalls = response.choices[0].message.tool_calls && response.choices[0].message.tool_calls.length > 0;
            const hasContent = response.choices[0].message.content !== null;
            
            if (hasToolCalls && hasContent) {
                console.log(`[ResponseProcessor] 返回混合响应（文本+工具调用） - sessionId: ${options.sessionId}`);
            } else if (hasToolCalls) {
                console.log(`[ResponseProcessor] 返回工具调用响应 - 工具数: ${response.choices[0].message.tool_calls!.length} - sessionId: ${options.sessionId}`);
            } else {
                console.log(`[ResponseProcessor] 返回文本响应 - sessionId: ${options.sessionId}`);
            }
            
            // 非流式响应处理完成后，主动清理会话
            this.claudeSessionManager.cleanupSession(options.sessionId);
            
            return response;
        } catch (error) {
            console.error(`[ResponseProcessor] Claude Code 执行错误 - sessionId: ${options.sessionId}:`, error);
            console.error(`[ResponseProcessor] 错误类型: ${error?.constructor?.name}`);
            console.error(`[ResponseProcessor] 错误消息: ${error instanceof Error ? error.message : String(error)}`);
            console.error(`[ResponseProcessor] 错误堆栈:`, error instanceof Error ? error.stack : '无堆栈信息');
            
            this.claudeSessionManager.abortSession(options.sessionId);
            throw error;
        }
    }

    /**
     * 处理串行工具调用结果
     */
    async processSequentialToolResult(options: ResponseOptions): Promise<ChatCompletionResponse> {
        console.log(`[ResponseProcessor] 处理串行工具调用结果 - sessionId: ${options.sessionId}`);
        
        try {
            const result = await this.sequentialToolHandler.handleToolResult(
                options.sessionId,
                options.messages
            );
            
            if (result.nextToolCall) {
                // 还有下一个工具调用
                console.log(`[ResponseProcessor] 返回下一个工具调用: ${result.nextToolCall.function.name}`);
                return ResponseHelper.createToolCallResponse(result.nextToolCall, options.model);
            } else if (result.shouldContinueSession) {
                // 所有工具调用完成，继续会话获取最终响应
                console.log(`[ResponseProcessor] 所有工具调用完成，继续会话`);
                
                const messageStream = await this.claudeSessionManager.startSession(
                    options.sessionId,
                    result.updatedMessages,
                    options.claudeModel,
                    options.customSystemPrompt
                );
                
                const sdkMessages = await ResponseHelper.processMessageStream(messageStream);
                const response = this.convertToResponse(sdkMessages, options.model);
                
                // 清理会话
                this.claudeSessionManager.cleanupSession(options.sessionId);
                
                return response;
            } else {
                // 处理完成，但没有更多内容
                console.log(`[ResponseProcessor] 串行工具调用处理完成`);
                this.claudeSessionManager.cleanupSession(options.sessionId);
                
                return {
                    id: `chatcmpl-${uuidv4()}`,
                    object: 'chat.completion',
                    created: Math.floor(Date.now() / 1000),
                    model: options.model,
                    choices: [{
                        index: 0,
                        message: {
                            role: 'assistant',
                            content: SEQUENTIAL_TOOL_CONFIG.DEFAULT_MESSAGES.TOOLS_COMPLETED,
                            tool_calls: undefined,
                            refusal: null
                        },
                        finish_reason: SEQUENTIAL_TOOL_CONFIG.FINISH_REASONS.STOP,
                        logprobs: null
                    }],
                    usage: {
                        prompt_tokens: 0,
                        completion_tokens: 0,
                        total_tokens: 0
                    }
                };
            }
        } catch (error) {
            console.error(`[ResponseProcessor] 串行工具调用处理错误 - sessionId: ${options.sessionId}:`, error);
            this.claudeSessionManager.abortSession(options.sessionId);
            throw error;
        }
    }

    /**
     * 处理流式响应
     */
    async processStream(
        res: Response,
        options: ResponseOptions
    ): Promise<void> {
        console.log(`[ResponseProcessor] 开始处理流式响应 - sessionId: ${options.sessionId}`);
        
        // 立即设置响应头，告诉客户端这是一个流式响应
        this.setupStreamHeaders(res, options.requestId);
        
        // 检测客户端断开
        let clientDisconnected = false;
        res.on('close', () => {
            if (!res.writableEnded) {
                clientDisconnected = true;
                console.log(`[ResponseProcessor] 客户端断开连接 - sessionId: ${options.sessionId}`);
                // 只有在客户端主动断开时才终止会话
                this.claudeSessionManager.abortSession(options.sessionId, SEQUENTIAL_TOOL_CONFIG.DEFAULT_MESSAGES.CLIENT_DISCONNECTED);
            }
        });
        
        const streamWriter = new StreamWriter(
            res,
            `chatcmpl-${this.generateId()}`,
            Math.floor(Date.now() / 1000),
            options.model
        );

        try {
            const messageStream = await this.claudeSessionManager.startSession(
                options.sessionId,
                options.conversationMessages,
                options.claudeModel,
                options.customSystemPrompt
            );
            
            console.log(`[ResponseProcessor] 消息流已创建 - sessionId: ${options.sessionId}`);

            await this.streamMessages(messageStream, streamWriter, options);
        } catch (error) {
            if (!clientDisconnected) {
                this.handleStreamError(error, res, options.sessionId);
            } else {
                console.log(`[ResponseProcessor] 客户端已断开，忽略错误 - sessionId: ${options.sessionId}`);
            }
        }
    }

    /**
     * 流式处理消息
     */
    private async streamMessages(
        messageStream: AsyncGenerator<SDKMessage>,
        writer: StreamWriter,
        options: ResponseOptions
    ): Promise<void> {
        console.log(`[ResponseProcessor] 开始流式处理消息 - sessionId: ${options.sessionId}`);
        let messageIndex = 0;
        let hasToolCalls = false;
        const allMessages: SDKMessage[] = [];
        
        try {
            for await (const message of messageStream) {
                console.log(`[ResponseProcessor] 收到流式消息 #${messageIndex + 1} - type: ${message.type}, sessionId: ${options.sessionId}`);
                allMessages.push(message); // 收集所有消息以提取 usage
                
                if (message.type === SEQUENTIAL_TOOL_CONFIG.SDK_MESSAGE_TYPES.ASSISTANT) {
                    if (messageIndex > 0) {
                        writer.sendText('\n\n');
                    }
                    
                    const handled = message.message ? await this.processStreamContent(
                        message.message.content,
                        writer,
                        options.messages,
                        options.sessionId
                    ) : false;
                    
                    if (handled) {
                        hasToolCalls = true;
                        console.log(`[ResponseProcessor] 检测到工具调用，结束流 - sessionId: ${options.sessionId}`);
                        const usage = ResponseHelper.extractUsage(allMessages);
                        writer.endStream(SEQUENTIAL_TOOL_CONFIG.FINISH_REASONS.TOOL_CALLS, usage);
                        return;
                    }
                    
                    messageIndex++;
                }
            }
            
            console.log(`[ResponseProcessor] 流式消息处理完成 - sessionId: ${options.sessionId}, 消息数: ${messageIndex}`);
            const usage = ResponseHelper.extractUsage(allMessages);
            writer.endStream(hasToolCalls ? SEQUENTIAL_TOOL_CONFIG.FINISH_REASONS.TOOL_CALLS : SEQUENTIAL_TOOL_CONFIG.FINISH_REASONS.STOP, usage);
        } catch (error) {
            console.error(`[ResponseProcessor] 流式处理错误 - sessionId: ${options.sessionId}:`, error);
            throw error;
        }
    }

    /**
     * 处理流式内容
     */
    private async processStreamContent(
        content: string | any[],
        writer: StreamWriter,
        messages: ChatMessage[],
        sessionId: string
    ): Promise<boolean> {
        if (typeof content === 'string' && content.length > 0) {
            writer.sendText(content);
            return false;
        }
        
        if (Array.isArray(content)) {
            for (const block of content) {
                if (block.type === 'text') {
                    writer.sendText(block.text);
                } else {
                    const toolCall = ResponseHelper.extractToolCall(block);
                    if (toolCall) {
                        const snapshot = ResponseHelper.createToolCallSnapshot(messages, toolCall);
                        this.messageTrieCache.createSnapshot(snapshot, sessionId);
                        writer.sendToolCall(toolCall);
                        return true;
                    }
                }
            }
        }
        
        return false;
    }

    /**
     * 设置流式响应头
     */
    private setupStreamHeaders(res: Response, requestId: string): void {
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Request-ID': requestId
        });
    }

    /**
     * 处理流式错误
     */
    private handleStreamError(error: any, res: Response, sessionId: string): void {
        console.error('流式响应错误:', error);
        
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorResponse = {
            error: {
                message: errorMessage,
                type: error?.constructor?.name || 'Error'
            }
        };
        
        res.write(`data: ${JSON.stringify(errorResponse)}\n\n`);
        res.end();
        
        // 暂时注释掉，避免过早终止会话
        // this.claudeSessionManager.abortSession(sessionId);
        throw error;
    }

    /**
     * 转换为 OpenAI 响应格式
     */
    convertToResponse(messages: SDKMessage[], model: string): ChatCompletionResponse {
        const assistantMessages = messages.filter(m => m.type === SEQUENTIAL_TOOL_CONFIG.SDK_MESSAGE_TYPES.ASSISTANT);
        
        let combinedContent = '';
        const allToolCalls: any[] = [];
        
        assistantMessages.forEach((msg, index) => {
            // 处理文本内容
            if (msg.message && msg.message.content) {
                if (combinedContent && index > 0) {
                    combinedContent += '\n\n';
                }
                combinedContent += this.extractTextContent(msg.message.content);
            }
            
            // 处理工具调用
            if (msg.message && Array.isArray(msg.message.content)) {
                msg.message.content.forEach((block: any) => {
                    const toolCall = ResponseHelper.extractToolCall(block);
                    if (toolCall) {
                        allToolCalls.push(toolCall);
                    }
                });
            }
        });
        
        return {
            id: `chatcmpl-${uuidv4()}`,
            object: 'chat.completion',
            created: Math.floor(Date.now() / 1000),
            model,
            choices: [{
                index: 0,
                message: {
                    role: SEQUENTIAL_TOOL_CONFIG.MESSAGE_ROLES.ASSISTANT,
                    content: combinedContent || null,
                    tool_calls: allToolCalls.length > 0 ? allToolCalls : undefined,
                    refusal: null
                },
                finish_reason: allToolCalls.length > 0 ? SEQUENTIAL_TOOL_CONFIG.FINISH_REASONS.TOOL_CALLS : SEQUENTIAL_TOOL_CONFIG.FINISH_REASONS.STOP,
                logprobs: null
            }],
            usage: ResponseHelper.extractUsage(messages),
            system_fingerprint: undefined
        } as ChatCompletionResponse;
    }

    private extractTextContent(content: string | any[]): string {
        if (typeof content === 'string') {
            return content;
        }
        if (Array.isArray(content)) {
            return content
                .filter(block => block.type === 'text')
                .map(block => block.text || '')
                .join('');
        }
        return '';
    }

    private generateId(): string {
        return uuidv4();
    }
}
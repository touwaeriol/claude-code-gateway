import { v4 as uuidv4 } from 'uuid';
import { ChatCompletionResponse, ChatCompletionChunk, ToolCall, ExtendedChatMessage as ChatMessage } from '../types/openai-sdk.js';
import { SDKMessage } from '../types/claude-code-types.js';
import { MCP_CONFIG, RESPONSE_FORMATS } from '../config/constants.js';
import { SEQUENTIAL_TOOL_CONFIG } from '../config/sequential-tool-config.js';

/**
 * 响应处理工具类
 */
export class ResponseHelper {
    /**
     * 创建工具调用响应
     */
    static createToolCallResponse(
        toolCall: ToolCall, 
        model: string
    ): ChatCompletionResponse {
        return {
            id: `chatcmpl-${uuidv4()}`,
            object: RESPONSE_FORMATS.OPENAI_COMPLETION,
            created: Math.floor(Date.now() / 1000),
            model,
            choices: [{
                index: 0,
                message: {
                    role: SEQUENTIAL_TOOL_CONFIG.MESSAGE_ROLES.ASSISTANT,
                    content: null,
                    tool_calls: [toolCall],
                    refusal: null
                },
                finish_reason: SEQUENTIAL_TOOL_CONFIG.FINISH_REASONS.TOOL_CALLS,
                logprobs: null
            }],
            usage: {
                prompt_tokens: 0,
                completion_tokens: 0,
                total_tokens: 0
            }
        };
    }

    /**
     * 从 SDK 消息中提取工具调用
     */
    static extractToolCall(block: any): ToolCall | null {
        if (block.type === 'tool_use' && block.name.startsWith(MCP_CONFIG.GATEWAY_PREFIX)) {
            return {
                id: block.id,
                type: 'function',
                function: {
                    name: block.name.replace(MCP_CONFIG.GATEWAY_PREFIX, ''),
                    arguments: JSON.stringify(block.input || {})
                }
            };
        }
        return null;
    }

    /**
     * 处理 SDK 消息流并检测工具调用
     */
    static async processMessageStream(
        messageStream: AsyncGenerator<SDKMessage>,
        onToolCall?: (toolCall: ToolCall) => void
    ): Promise<SDKMessage[]> {
        const messages: SDKMessage[] = [];
        let hasToolCalls = false;
        let lastAssistantMessage: any = null;
        
        for await (const message of messageStream) {
            messages.push(message);
            
            // 记录消息类型，帮助调试
            console.log(`[ResponseHelper] 收到 SDK 消息: type=${message.type}`);
            
            if (message.type === SEQUENTIAL_TOOL_CONFIG.SDK_MESSAGE_TYPES.ASSISTANT && message.message) {
                lastAssistantMessage = message.message;
                const claudeMessage = message.message as any;
                
                // 检查是否有工具调用
                if (Array.isArray(claudeMessage.content)) {
                    for (const block of claudeMessage.content) {
                        const toolCall = this.extractToolCall(block);
                        if (toolCall && onToolCall) {
                            onToolCall(toolCall);
                            hasToolCalls = true;
                        }
                    }
                }
                
                // 如果收到 stop_reason: "tool_use"，说明 SDK 已经发送了所有工具调用
                // 可以立即停止处理，不需要等待 result 消息
                if (claudeMessage.stop_reason === SEQUENTIAL_TOOL_CONFIG.STOP_REASONS.TOOL_USE) {
                    console.log(`[ResponseHelper] 收到 stop_reason: "${SEQUENTIAL_TOOL_CONFIG.STOP_REASONS.TOOL_USE}"，SDK 等待工具调用结果`);
                    break; // 立即退出循环
                }
                
                if (claudeMessage.stop_reason) {
                    console.log(`[ResponseHelper] stop_reason: ${claudeMessage.stop_reason}`);
                }
            }
            
            // 如果收到 result 消息，说明 SDK 已完成当前轮次
            if (message.type === SEQUENTIAL_TOOL_CONFIG.SDK_MESSAGE_TYPES.RESULT) {
                console.log(`[ResponseHelper] SDK 完成当前轮次，result subtype: ${(message as any).subtype}`);
                
                // 检查最后一个 assistant 消息的 stop_reason
                if (lastAssistantMessage?.stop_reason) {
                    console.log(`[ResponseHelper] 最终 stop_reason: ${lastAssistantMessage.stop_reason}`);
                }
                
                break;
            }
        }
        
        // 判断 SDK 状态
        const hasResultMessage = messages.some(m => m.type === SEQUENTIAL_TOOL_CONFIG.SDK_MESSAGE_TYPES.RESULT);
        
        if (hasToolCalls && !hasResultMessage) {
            // 有工具调用但没有 result 消息，说明 SDK 在等待工具结果
            console.log(`[ResponseHelper] SDK 正在等待工具调用结果（未收到 result 消息）`);
        } else if (hasToolCalls && hasResultMessage) {
            // 有工具调用且有 result 消息，这种情况不应该发生
            // 因为 SDK 在发起工具调用后会暂停等待结果
            console.log(`[ResponseHelper] 警告：SDK 在工具调用后返回了 result 消息`);
        }
        
        return messages;
    }

    /**
     * 创建流式响应块
     */
    static createStreamChunk(
        chatId: string,
        created: number,
        model: string,
        delta: any,
        finishReason?: string | null
    ): ChatCompletionChunk {
        return {
            id: chatId,
            object: RESPONSE_FORMATS.OPENAI_CHUNK,
            created,
            model,
            choices: [{
                index: 0,
                delta,
                finish_reason: (finishReason as any) || null
            }]
        };
    }

    /**
     * 创建带工具调用的消息快照
     */
    static createToolCallSnapshot(
        messages: ChatMessage[],
        toolCall: ToolCall
    ): ChatMessage[] {
        return [
            ...messages,
            {
                role: 'assistant' as const,
                content: null,
                tool_calls: [toolCall],
                refusal: null
            }
        ];
    }

    /**
     * 提取使用量信息
     */
    static extractUsage(messages: SDKMessage[]): any {
        for (const msg of messages) {
            if (msg.type === SEQUENTIAL_TOOL_CONFIG.SDK_MESSAGE_TYPES.ASSISTANT && msg.message && 'usage' in msg.message) {
                const usage = msg.message.usage as any;
                return {
                    prompt_tokens: usage.input_tokens || 0,
                    completion_tokens: usage.output_tokens || 0,
                    total_tokens: (usage.input_tokens || 0) + (usage.output_tokens || 0)
                };
            }
        }
        return {
            prompt_tokens: 0,
            completion_tokens: 0,
            total_tokens: 0
        };
    }
}
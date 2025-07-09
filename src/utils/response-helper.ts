import { v4 as uuidv4 } from 'uuid';
import { ChatCompletionResponse, ChatCompletionChunk, ToolCall, ExtendedChatMessage as ChatMessage } from '../types/openai-sdk.js';
import { SDKMessage } from '../types/claude-code-types.js';
import { MCP_CONFIG, RESPONSE_FORMATS } from '../config/constants.js';

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
                    role: 'assistant',
                    content: null,
                    tool_calls: [toolCall],
                    refusal: null
                },
                finish_reason: 'tool_calls',
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
        
        for await (const message of messageStream) {
            messages.push(message);
            
            if (message.type === 'assistant' && message.message && Array.isArray(message.message.content)) {
                for (const block of message.message.content) {
                    const toolCall = this.extractToolCall(block);
                    if (toolCall && onToolCall) {
                        onToolCall(toolCall);
                        return messages; // 检测到工具调用立即返回
                    }
                }
            }
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
            if (msg.type === 'assistant' && msg.message && 'usage' in msg.message) {
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
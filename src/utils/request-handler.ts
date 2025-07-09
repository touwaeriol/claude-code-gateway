import { Request } from 'express';
import { ChatCompletionCreateParams, ExtendedChatMessage, Tool } from '../types/openai-sdk.js';
import { MODEL_CONFIG } from '../config/constants.js';

export interface ProcessedRequest {
    requestId: string;
    model: string;
    messages: ExtendedChatMessage[];
    tools?: Tool[];
    stream: boolean;
    temperature?: number;
    maxTokens?: number;
    abortController: AbortController;
}

/**
 * 请求处理工具类
 */
export class RequestHandler {
    /**
     * 处理聊天完成请求
     */
    static processRequest(req: Request<{}, any, ChatCompletionCreateParams>): ProcessedRequest {
        const requestId = req.requestId!;
        const abortController = new AbortController();
        
        // 暂时注释掉响应断开处理，避免过早终止 Claude Code SDK
        // TODO: 需要更好的方式处理响应断开，确保 Claude Code SDK 有足够时间完成
        // res.on('close', () => {
        //     console.log(`客户端断开连接，取消请求 ${requestId}`);
        //     abortController.abort();
        // });

        const {
            model,
            messages,
            tools,
            stream = false,
            temperature,
            max_tokens
        } = req.body;

        // 验证必需的 model 参数
        if (!model) {
            throw new Error(`模型参数是必需的。支持的模型: ${MODEL_CONFIG.SUPPORTED_MODELS.join(', ')}`);
        }

        // 转换消息为 ExtendedChatMessage 格式，过滤掉 'developer' 角色
        const extendedMessages: ExtendedChatMessage[] = messages
            .filter((msg: any) => msg.role !== 'developer')
            .map((msg: any) => ({
                role: msg.role as 'user' | 'assistant' | 'system' | 'tool',
                content: msg.content || null,
                tool_calls: msg.tool_calls,
                tool_call_id: msg.tool_call_id,
                name: msg.name,
                refusal: msg.refusal
            }));

        return {
            requestId,
            model,
            messages: extendedMessages,
            tools,
            stream: stream || false,
            temperature: temperature ?? undefined,
            maxTokens: max_tokens ?? undefined,
            abortController
        };
    }

    /**
     * 获取 Claude 模型名称
     */
    static getClaudeModel(model: string): string {
        const claudeModel = MODEL_CONFIG.MODEL_MAPPING[model as keyof typeof MODEL_CONFIG.MODEL_MAPPING];
        
        if (!claudeModel) {
            throw new Error(`不支持的模型: ${model}。支持的模型: ${MODEL_CONFIG.SUPPORTED_MODELS.join(', ')}`);
        }
        
        return claudeModel;
    }
}
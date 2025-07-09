import { ChatCompletionCreateParams } from '../types/openai-sdk.js';
import { ValidationError } from '../services/error-handler.js';
import { MODEL_CONFIG } from '../config/constants.js';

/**
 * 请求验证器
 */
export class RequestValidator {
    /**
     * 验证聊天完成请求
     */
    static validate(request: ChatCompletionCreateParams): void {
        this.validateModel(request.model);
        this.validateMessages(request.messages);
        this.validateTools(request.tools);
    }

    /**
     * 验证模型
     */
    private static validateModel(model?: string): void {
        if (model && !this.isModelSupported(model)) {
            throw new ValidationError(`Model '${model}' is not supported`);
        }
    }

    /**
     * 验证消息
     */
    private static validateMessages(messages?: any[]): void {
        if (!messages || !Array.isArray(messages) || messages.length === 0) {
            throw new ValidationError('Messages array is required and must not be empty');
        }
    }

    /**
     * 验证工具
     */
    private static validateTools(tools?: any[]): void {
        if (!tools) return;

        if (!Array.isArray(tools)) {
            throw new ValidationError('Tools must be an array');
        }
        
        for (const tool of tools) {
            if (tool.type !== 'function') {
                throw new ValidationError('Only function tools are supported');
            }
            
            if (!tool.function?.name) {
                throw new ValidationError('Tool function name is required');
            }
        }
    }

    /**
     * 检查模型是否支持
     */
    private static isModelSupported(model: string): boolean {
        return MODEL_CONFIG.SUPPORTED_MODELS.includes(model as any) || model.startsWith('custom-');
    }
}
import { Response } from 'express';
import { ToolCall } from '../types/openai-sdk.js';
import { ResponseHelper } from './response-helper.js';
import { RESPONSE_FORMATS } from '../config/constants.js';

/**
 * 流式响应写入器
 */
export class StreamWriter {
    constructor(
        private res: Response,
        private chatId: string,
        private created: number,
        private model: string
    ) {}

    /**
     * 发送文本内容
     */
    sendText(text: string): void {
        console.log(`[StreamWriter] 发送文本: ${text.substring(0, 50)}...`);
        const chunk = ResponseHelper.createStreamChunk(
            this.chatId,
            this.created,
            this.model,
            { content: text },
            null
        );
        const data = `data: ${JSON.stringify(chunk)}\n\n`;
        const written = this.res.write(data);
        console.log(`[StreamWriter] 写入成功: ${written}, 数据长度: ${data.length}`);
    }

    /**
     * 发送工具调用
     */
    sendToolCall(toolCall: ToolCall): void {
        const chunk = ResponseHelper.createStreamChunk(
            this.chatId,
            this.created,
            this.model,
            { tool_calls: [toolCall] },
            'tool_calls'
        );
        this.res.write(`data: ${JSON.stringify(chunk)}\n\n`);
    }

    /**
     * 发送 usage 信息
     */
    sendUsage(usage: any): void {
        console.log(`[StreamWriter] 发送 usage 信息:`, usage);
        const chunk = ResponseHelper.createStreamChunk(
            this.chatId,
            this.created,
            this.model,
            {},
            null
        );
        // 在 chunk 中添加 usage 信息
        (chunk as any).usage = usage;
        this.res.write(`data: ${JSON.stringify(chunk)}\n\n`);
    }

    /**
     * 结束流
     */
    endStream(finishReason: string, usage?: any): void {
        console.log(`[StreamWriter] 结束流 - finishReason: ${finishReason}`);
        
        // 如果有 usage 信息，先发送 usage
        if (usage) {
            this.sendUsage(usage);
        }
        
        const chunk = ResponseHelper.createStreamChunk(
            this.chatId,
            this.created,
            this.model,
            {},
            finishReason
        );
        this.res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        this.res.write(`data: ${RESPONSE_FORMATS.STREAM_DONE}\n\n`);
        console.log(`[StreamWriter] 调用 res.end()`);
        this.res.end();
    }
}
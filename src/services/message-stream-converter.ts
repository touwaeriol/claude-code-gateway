import { ExtendedChatMessage as ChatMessage, ToolCall } from '../types/openai-sdk.js';
import { SDKMessage, SDKUserMessage } from '../types/claude-code-types.js';
import { v4 as uuidv4 } from 'uuid';

// 定义 Claude Code SDK 消息格式类型
interface APIUserMessage {
  role: 'user';
  content: string | ContentBlockParam[];
}

type ContentBlockParam = TextBlockParam | ImageBlockParam | ToolResultBlockParam;

interface TextBlockParam {
  type: 'text';
  text: string;
}

interface ImageBlockParam {
  type: 'image';
  source: {
    type: 'base64';
    media_type: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
    data: string;
  };
}

interface ToolResultBlockParam {
  type: 'tool_result';
  tool_use_id: string;
  content: string | Array<TextBlockParam | ImageBlockParam>;
}

/**
 * 转换 OpenAI 消息到 Claude Code SDK 消息流格式
 */
export class MessageStreamConverter {
  private sessionId: string;

  constructor(sessionId?: string) {
    this.sessionId = sessionId || uuidv4();
  }

  /**
   * 将 OpenAI 消息转换为 Claude SDK 消息流
   */
  async *convertToSDKStream(messages: ChatMessage[]): AsyncIterable<SDKUserMessage> {
    for (const message of messages) {
      const sdkMessage = this.convertToSDKUserMessage(message);
      if (sdkMessage) {
        yield sdkMessage;
      }
    }
  }

  /**
   * 将单个 OpenAI 消息转换为 SDK 用户消息
   */
  private convertToSDKUserMessage(message: ChatMessage): SDKUserMessage | null {
    switch (message.role) {
      case 'user':
        return {
          type: 'user',
          message: this.convertToAPIUserMessage(message),
          parent_tool_use_id: null,
          session_id: this.sessionId
        };

      case 'assistant':
        // Assistant 消息需要作为上下文传递
        // 转换为用户消息格式，但标记为 assistant 角色的内容
        return {
          type: 'user',
          message: {
            role: 'user',
            content: `Assistant: ${typeof message.content === 'string' ? message.content : JSON.stringify(message.content)}`
          },
          parent_tool_use_id: null,
          session_id: this.sessionId
        };

      case 'tool':
        // 工具结果作为用户消息发送
        return {
          type: 'user',
          message: this.convertToolResultToUserMessage(message),
          parent_tool_use_id: message.tool_call_id || null,
          session_id: this.sessionId
        };

      case 'system':
        // 系统消息应该作为 customSystemPrompt 传递，不在消息流中
        return null;

      default:
        return null;
    }
  }

  /**
   * 将 OpenAI 用户消息转换为 API 格式
   */
  private convertToAPIUserMessage(message: ChatMessage): APIUserMessage {
    const content = this.convertContent(message.content);
    
    return {
      role: 'user',
      content: content
    };
  }

  /**
   * 将工具结果转换为用户消息
   */
  private convertToolResultToUserMessage(message: ChatMessage): APIUserMessage {
    const toolResultBlock: ToolResultBlockParam = {
      type: 'tool_result',
      tool_use_id: message.tool_call_id!,
      content: this.convertToolResultContent(message.content)
    };

    return {
      role: 'user',
      content: [toolResultBlock]
    };
  }

  /**
   * 转换工具结果内容
   */
  private convertToolResultContent(content: string | null | undefined | any): string | Array<TextBlockParam | ImageBlockParam> {
    if (content === null || content === undefined) {
      return '';
    }

    if (typeof content === 'string') {
      return content;
    }

    // 其他情况转为字符串
    return JSON.stringify(content);
  }

  /**
   * 转换消息内容
   */
  private convertContent(content: string | null | undefined | any): string | Array<TextBlockParam | ImageBlockParam> {
    if (content === null || content === undefined) {
      return '';
    }

    if (typeof content === 'string') {
      return content;
    }

    // 处理复杂内容（如图片等）
    if (Array.isArray(content)) {
      // 检查是否只包含文本内容
      const hasOnlyText = content.every(item => item.type === 'text');
      
      if (hasOnlyText) {
        // 如果只有文本，合并为单个字符串
        const texts = content
          .filter(item => item.type === 'text')
          .map(item => item.text || '')
          .join('\n');
        return texts || '';
      }
      
      // 如果包含图片或其他内容，返回块数组
      const blocks: Array<TextBlockParam | ImageBlockParam> = [];
      
      for (const item of content) {
        if (item.type === 'text') {
          blocks.push({
            type: 'text',
            text: item.text || ''
          } as TextBlockParam);
        } else if (item.type === 'image_url') {
          // 处理图片内容
          blocks.push({
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/jpeg', // 可能需要从 URL 或数据中提取
              data: this.extractImageData(item.image_url.url)
            }
          } as ImageBlockParam);
        }
      }
      
      return blocks.length > 0 ? blocks : [{type: 'text', text: ''}];
    }

    // 其他情况转为字符串
    return JSON.stringify(content);
  }

  /**
   * 从图片 URL 提取 base64 数据
   */
  private extractImageData(url: string): string {
    // 处理 data URL
    if (url.startsWith('data:')) {
      const [header, data] = url.split(',');
      return data || '';
    }
    
    // 处理 HTTP URL - 这里可能需要异步下载
    // 暂时返回空字符串，实际使用时需要实现
    return '';
  }

  /**
   * 创建一个简单的用户消息流
   */
  static async *createSimpleUserStream(prompt: string, sessionId?: string): AsyncIterable<SDKUserMessage> {
    const sid = sessionId || uuidv4();
    
    yield {
      type: 'user',
      message: {
        role: 'user',
        content: prompt
      },
      parent_tool_use_id: null,
      session_id: sid
    };
  }
}
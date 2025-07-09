/**
 * OpenAI SDK 类型定义
 * 
 * 注意：
 * 1. Claude Code SDK 返回的消息类型与 OpenAI 不同
 * 2. 需要在 ResponseProcessor 中进行类型转换
 * 3. 主要差异：
 *    - OpenAI: message.tool_calls 是数组
 *    - Claude Code SDK: message.content 是 ContentBlock 数组，其中 ToolUseBlock 表示工具调用
 */

// 从 OpenAI SDK 导入类型
import type {
  ChatCompletion,
  ChatCompletionChunk,
  ChatCompletionCreateParams,
  ChatCompletionMessage,
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
  ChatCompletionTool,
  ChatCompletionToolMessageParam,
  ChatCompletionUserMessageParam,
  ChatCompletionSystemMessageParam,
  ChatCompletionAssistantMessageParam,
} from 'openai/resources/chat/completions';

// 重新导出常用类型
export type {
  ChatCompletion,
  ChatCompletionChunk,
  ChatCompletionCreateParams,
  ChatCompletionMessage,
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
  ChatCompletionTool,
  ChatCompletionToolMessageParam,
  ChatCompletionUserMessageParam,
  ChatCompletionSystemMessageParam,
  ChatCompletionAssistantMessageParam,
};

// 创建类型别名以保持向后兼容
export type ChatMessage = ChatCompletionMessageParam;
export type ToolCall = ChatCompletionMessageToolCall;
export type Tool = ChatCompletionTool;
export type ChatCompletionRequest = ChatCompletionCreateParams;
export type ChatCompletionResponse = ChatCompletion;

// 扩展类型以支持 'tool' 角色和其他字段
// OpenAI 内容部分类型
export interface MessageContentPart {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: {
    url: string;
    detail?: 'low' | 'high' | 'auto';
  };
}

export interface ExtendedChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string | null | MessageContentPart[];
  tool_calls?: ChatCompletionMessageToolCall[];
  tool_call_id?: string; // for tool messages
  name?: string;
  refusal?: string | null;
}

// 使用 SDK 的 Usage 类型
export type Usage = ChatCompletion['usage'];
export type Choice = ChatCompletion['choices'][0];
export type ChunkChoice = ChatCompletionChunk['choices'][0];

// 错误响应类型
export interface ErrorResponse {
  error: {
    message: string;
    type: string;
    param?: string | null;
    code?: string;
  };
}

/**
 * 类型转换说明：
 * 
 * Claude Code SDK 消息格式：
 * {
 *   role: 'assistant',
 *   content: [
 *     { type: 'text', text: 'Hello' },
 *     { type: 'tool_use', id: 'xxx', name: 'function_name', input: {...} }
 *   ]
 * }
 * 
 * OpenAI 消息格式：
 * {
 *   role: 'assistant',
 *   content: 'Hello',
 *   tool_calls: [{
 *     id: 'xxx',
 *     type: 'function',
 *     function: { name: 'function_name', arguments: '...' }
 *   }]
 * }
 */
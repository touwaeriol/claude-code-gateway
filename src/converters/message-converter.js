import { logger } from '../utils/logger.js';

export class MessageConverter {
  // 将 OpenAI 格式消息转换为 Claude 格式
  static openAIToClaude(openAIMessages, tools = null) {
    const claudeMessages = [];
    let systemMessage = null;
    
    for (const message of openAIMessages) {
      if (message.role === 'system') {
        systemMessage = message.content;
      } else if (message.role === 'user') {
        // 处理用户消息
        const claudeMessage = {
          role: 'user',
          content: message.content
        };
        claudeMessages.push(claudeMessage);
      } else if (message.role === 'assistant') {
        // 处理助手消息，包括工具调用
        if (message.tool_calls) {
          // OpenAI 工具调用格式
          const toolUseContent = message.tool_calls.map(toolCall => ({
            type: 'tool_use',
            id: toolCall.id,
            name: toolCall.function.name,
            input: JSON.parse(toolCall.function.arguments)
          }));
          
          claudeMessages.push({
            role: 'assistant',
            content: [
              ...(message.content ? [{ type: 'text', text: message.content }] : []),
              ...toolUseContent
            ]
          });
        } else if (message.function_call) {
          // 旧版 OpenAI function calling 格式
          claudeMessages.push({
            role: 'assistant',
            content: [{
              type: 'tool_use',
              id: `call_${this.generateId()}`,
              name: message.function_call.name,
              input: JSON.parse(message.function_call.arguments)
            }]
          });
        } else {
          // 普通文本消息
          claudeMessages.push({
            role: 'assistant',
            content: message.content
          });
        }
      } else if (message.role === 'tool' || message.role === 'function') {
        // 工具响应
        claudeMessages.push({
          role: 'user',
          content: [{
            type: 'tool_result',
            tool_use_id: message.tool_call_id || message.name,
            content: message.content
          }]
        });
      }
    }

    // 返回消息和系统提示
    return { messages: claudeMessages, system: systemMessage };
  }

  // 将 OpenAI 工具定义转换为 Claude 格式
  static openAIToolsToClaude(openAITools) {
    if (!openAITools || openAITools.length === 0) {
      return null;
    }

    return openAITools.map(tool => {
      if (tool.type === 'function') {
        return {
          name: tool.function.name,
          description: tool.function.description,
          input_schema: tool.function.parameters
        };
      }
      return tool;
    });
  }

  // 将 Claude 响应转换为 OpenAI 格式
  static claudeResponseToOpenAI(claudeResponse, requestModel) {
    const timestamp = Math.floor(Date.now() / 1000);
    
    // 检查是否有工具调用
    const toolCalls = this.extractToolCalls(claudeResponse.content);
    const textContent = this.extractTextContent(claudeResponse.content);
    
    const message = {
      role: 'assistant',
      content: textContent || null
    };
    
    // 如果有工具调用，添加到消息中
    if (toolCalls.length > 0) {
      message.tool_calls = toolCalls.map((toolCall, index) => ({
        id: toolCall.id,
        type: 'function',
        function: {
          name: toolCall.name,
          arguments: JSON.stringify(toolCall.input)
        }
      }));
    }
    
    return {
      id: `chatcmpl-${this.generateId()}`,
      object: 'chat.completion',
      created: timestamp,
      model: requestModel,
      choices: [{
        index: 0,
        message: message,
        finish_reason: this.mapFinishReason(claudeResponse.stop_reason)
      }],
      usage: {
        prompt_tokens: claudeResponse.usage?.input_tokens || 0,
        completion_tokens: claudeResponse.usage?.output_tokens || 0,
        total_tokens: (claudeResponse.usage?.input_tokens || 0) + (claudeResponse.usage?.output_tokens || 0)
      }
    };
  }

  // 将 Claude 流式块转换为 OpenAI 格式
  static claudeStreamChunkToOpenAI(chunk, requestModel, streamState = {}) {
    const timestamp = Math.floor(Date.now() / 1000);
    
    // 处理不同类型的 Claude 流式事件
    if (chunk.type === 'message_start') {
      return {
        id: `chatcmpl-${this.generateId()}`,
        object: 'chat.completion.chunk',
        created: timestamp,
        model: requestModel,
        choices: [{
          index: 0,
          delta: { role: 'assistant', content: '' },
          finish_reason: null
        }]
      };
    } else if (chunk.type === 'content_block_start') {
      // 处理内容块开始
      if (chunk.content_block?.type === 'tool_use') {
        // 工具调用开始
        streamState.currentToolCall = {
          index: chunk.index,
          id: chunk.content_block.id,
          name: chunk.content_block.name,
          arguments: ''
        };
        
        return {
          id: `chatcmpl-${this.generateId()}`,
          object: 'chat.completion.chunk',
          created: timestamp,
          model: requestModel,
          choices: [{
            index: 0,
            delta: {
              tool_calls: [{
                index: chunk.index,
                id: chunk.content_block.id,
                type: 'function',
                function: {
                  name: chunk.content_block.name,
                  arguments: ''
                }
              }]
            },
            finish_reason: null
          }]
        };
      }
    } else if (chunk.type === 'content_block_delta') {
      if (chunk.delta?.type === 'text_delta') {
        // 文本内容
        return {
          id: `chatcmpl-${this.generateId()}`,
          object: 'chat.completion.chunk',
          created: timestamp,
          model: requestModel,
          choices: [{
            index: 0,
            delta: { content: chunk.delta.text || '' },
            finish_reason: null
          }]
        };
      } else if (chunk.delta?.type === 'input_json_delta') {
        // 工具参数流式传输
        if (streamState.currentToolCall) {
          streamState.currentToolCall.arguments += chunk.delta.partial_json || '';
          
          return {
            id: `chatcmpl-${this.generateId()}`,
            object: 'chat.completion.chunk',
            created: timestamp,
            model: requestModel,
            choices: [{
              index: 0,
              delta: {
                tool_calls: [{
                  index: streamState.currentToolCall.index,
                  function: {
                    arguments: chunk.delta.partial_json || ''
                  }
                }]
              },
              finish_reason: null
            }]
          };
        }
      }
    } else if (chunk.type === 'content_block_stop') {
      // 内容块结束
      if (streamState.currentToolCall && chunk.index === streamState.currentToolCall.index) {
        streamState.currentToolCall = null;
      }
    } else if (chunk.type === 'message_delta') {
      return {
        id: `chatcmpl-${this.generateId()}`,
        object: 'chat.completion.chunk',
        created: timestamp,
        model: requestModel,
        choices: [{
          index: 0,
          delta: {},
          finish_reason: this.mapFinishReason(chunk.delta?.stop_reason)
        }],
        usage: chunk.usage ? {
          prompt_tokens: chunk.usage.input_tokens || 0,
          completion_tokens: chunk.usage.output_tokens || 0,
          total_tokens: (chunk.usage.input_tokens || 0) + (chunk.usage.output_tokens || 0)
        } : undefined
      };
    }

    return null;
  }

  // 提取文本内容
  static extractTextContent(content) {
    if (Array.isArray(content)) {
      return content
        .filter(block => block.type === 'text')
        .map(block => block.text)
        .join('');
    }
    return content || '';
  }

  // 提取工具调用
  static extractToolCalls(content) {
    if (!Array.isArray(content)) {
      return [];
    }
    
    return content
      .filter(block => block.type === 'tool_use')
      .map(block => ({
        id: block.id,
        name: block.name,
        input: block.input
      }));
  }

  // 映射结束原因
  static mapFinishReason(stopReason) {
    const reasonMap = {
      'end_turn': 'stop',
      'max_tokens': 'length',
      'stop_sequence': 'stop'
    };
    return reasonMap[stopReason] || 'stop';
  }

  // 生成唯一 ID
  static generateId() {
    return Math.random().toString(36).substring(2, 15) + 
           Math.random().toString(36).substring(2, 15);
  }

  // 将 OpenAI 错误转换为标准格式
  static errorToOpenAI(error) {
    return {
      error: {
        message: error.message,
        type: error.type || 'api_error',
        code: error.code || null
      }
    };
  }
}
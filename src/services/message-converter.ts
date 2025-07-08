import { ChatMessage, Tool, ToolCall } from '../types/openai';
import { SDKMessage } from '../types/claude';

export class MessageConverter {
  /**
   * 构建 prompt（简化版本，不包含会话ID和工具定义）
   */
  buildPrompt(messages: ChatMessage[]): string {
    let prompt = '';
    
    // 处理对话历史
    for (const msg of messages) {
      switch (msg.role) {
        case 'user':
          if (msg.content !== null && msg.content !== undefined) {
            const userContent = typeof msg.content === 'string' 
              ? msg.content 
              : JSON.stringify(msg.content);
            prompt += `Human: ${userContent}\n\n`;
          } else {
            prompt += `Human: \n\n`;
          }
          break;
          
        case 'assistant':
          if (msg.content) {
            const assistantContent = typeof msg.content === 'string' 
              ? msg.content 
              : JSON.stringify(msg.content);
            prompt += `Assistant: ${assistantContent}\n\n`;
          }
          
          // 处理工具调用
          if (msg.tool_calls) {
            for (const toolCall of msg.tool_calls) {
              prompt += `Assistant: I'll use the ${toolCall.function.name} tool.\n\n`;
              prompt += `Tool Use (${toolCall.id}): ${toolCall.function.name}\n`;
              prompt += `Arguments: ${toolCall.function.arguments}\n\n`;
            }
          }
          break;
          
        case 'tool':
          if (msg.content !== null && msg.content !== undefined) {
            const toolContent = typeof msg.content === 'string' 
              ? msg.content 
              : JSON.stringify(msg.content);
            prompt += `Tool Result (${msg.tool_call_id}): ${toolContent}\n\n`;
          } else {
            prompt += `Tool Result (${msg.tool_call_id}): \n\n`;
          }
          break;
      }
    }
    
    // 添加 Assistant 前缀
    prompt += "Assistant: ";
    
    return prompt;
  }

  /**
   * 将 OpenAI 消息转换为 Claude prompt
   */
  buildClaudePrompt(messages: ChatMessage[], sessionId: string, tools?: Tool[]): string {
    // 计算总输入长度用于日志记录
    let totalInputLength = 0;
    messages.forEach(msg => {
      if (msg.content) {
        totalInputLength += typeof msg.content === 'string' 
          ? msg.content.length 
          : JSON.stringify(msg.content).length;
      }
    });
    
    console.log(`\n构建 Claude Prompt - 消息数: ${messages.length}, 总内容长度: ${totalInputLength} 字符`);
    
    let prompt = `[SESSION: ${sessionId}]\n\n`;

    // 1. 处理系统消息
    const systemMessages = messages.filter(m => m.role === 'system');
    if (systemMessages.length > 0) {
      prompt += systemMessages.map(m => {
        // 确保 content 是字符串
        if (m.content === null || m.content === undefined) {
          return '';
        }
        return typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
      }).filter(content => content.length > 0).join('\n') + '\n\n';
    }

    // 2. 添加工具定义（如果有）
    if (tools && tools.length > 0) {
      prompt += this.formatToolsDefinition(tools) + '\n\n';
    }

    // 3. 构建对话历史
    const conversationMessages = messages.filter(m => m.role !== 'system');
    
    for (const msg of conversationMessages) {
      switch (msg.role) {
        case 'user':
          // 确保 content 是字符串
          if (msg.content === null || msg.content === undefined) {
            prompt += `Human: \n\n`;
          } else {
            // 确保对象被序列化为紧凑的单行 JSON
            const userContent = typeof msg.content === 'string' 
              ? msg.content 
              : JSON.stringify(msg.content);
            prompt += `Human: ${userContent}\n\n`;
          }
          break;
          
        case 'assistant':
          if (msg.content) {
            // 确保 content 是字符串
            const assistantContent = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
            prompt += `Assistant: ${assistantContent}\n\n`;
          }
          
          // 处理工具调用
          if (msg.tool_calls) {
            for (const toolCall of msg.tool_calls) {
              prompt += `Assistant: I'll use the ${toolCall.function.name} tool.\n\n`;
              prompt += `Tool Use (${toolCall.id}): ${toolCall.function.name}\n`;
              prompt += `Arguments: ${toolCall.function.arguments}\n\n`;
            }
          }
          break;
          
        case 'tool':
          // 确保 content 是字符串
          if (msg.content === null || msg.content === undefined) {
            prompt += `Tool Result (${msg.tool_call_id}): \n\n`;
          } else {
            const toolContent = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
            prompt += `Tool Result (${msg.tool_call_id}): ${toolContent}\n\n`;
          }
          break;
      }
    }

    // 4. 添加 Assistant 前缀，让 Claude 继续对话
    prompt += "Assistant: ";
    
    console.log(`构建完成 - Prompt 长度: ${prompt.length} 字符`);
    
    return prompt;
  }

  /**
   * 格式化工具定义
   */
  private formatToolsDefinition(tools: Tool[]): string {
    let toolsText = '你可以使用以下工具：\n\n';
    
    for (const tool of tools) {
      const func = tool.function;
      toolsText += `### ${func.name}\n`;
      toolsText += `${func.description}\n`;
      
      if (func.parameters) {
        toolsText += '参数：\n```json\n';
        toolsText += JSON.stringify(func.parameters, null, 2);
        toolsText += '\n```\n';
      }
      
      toolsText += '\n';
    }
    
    toolsText += '调用工具时，使用以下格式：\n';
    toolsText += '```\n';
    toolsText += 'I need to use the tool_name tool.\n';
    toolsText += '```\n';
    
    return toolsText;
  }

  /**
   * 从 Claude 响应中提取工具调用
   */
  extractToolCalls(response: string): ToolCall[] {
    const toolCalls: ToolCall[] = [];
    
    // 匹配工具调用模式
    // 例如: "I'll use the search tool" 或 "I need to use the calculate tool"
    const toolCallPattern = /I(?:'ll| will| need to) use the (\w+) tool/gi;
    const matches = Array.from(response.matchAll(toolCallPattern));
    
    for (const match of matches) {
      const toolName = match[1];
      
      // 尝试从响应中提取参数
      // 查找工具名称后面的 JSON 代码块
      const argsPattern = new RegExp(
        `${toolName}.*?\\n\`\`\`(?:json)?\\n([\\s\\S]*?)\\n\`\`\``,
        'i'
      );
      const argsMatch = response.match(argsPattern);
      
      let args = '{}';
      if (argsMatch && argsMatch[1]) {
        try {
          // 验证 JSON 是否有效
          JSON.parse(argsMatch[1]);
          args = argsMatch[1];
        } catch {
          // 如果不是有效的 JSON，使用空对象
          args = '{}';
        }
      }
      
      toolCalls.push({
        id: `call_${this.generateId()}`,
        type: 'function',
        function: {
          name: toolName,
          arguments: args
        }
      });
    }
    
    return toolCalls;
  }

  /**
   * 将 Claude SDK 消息转换为 OpenAI 格式
   */
  convertClaudeMessage(claudeMessages: SDKMessage[]): {
    content: string;
    toolCalls?: ToolCall[];
  } {
    let content = '';
    const toolCalls: ToolCall[] = [];
    
    for (const msg of claudeMessages) {
      if (msg.type === 'assistant' && msg.message) {
        // 处理助手消息
        const assistantContent = msg.message.content;
        
        if (typeof assistantContent === 'string') {
          content += assistantContent;
        } else if (Array.isArray(assistantContent)) {
          // 处理结构化内容
          for (const item of assistantContent) {
            if (item.type === 'text' && item.text) {
              content += item.text;
            } else if (item.type === 'tool_use' && 'name' in item) {
              // 处理工具使用
              const toolName = item.name.replace(/^mcp__gateway__/, '');
              toolCalls.push({
                id: item.id || `call_${this.generateId()}`,
                type: 'function',
                function: {
                  name: toolName,
                  arguments: JSON.stringify(item.input || {})
                }
              });
            }
          }
        }
      }
    }
    
    // 从内容中提取可能的工具调用
    if (content && toolCalls.length === 0) {
      const extractedCalls = this.extractToolCalls(content);
      toolCalls.push(...extractedCalls);
    }
    
    return {
      content: content.trim() || '',
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined
    };
  }

  /**
   * 生成唯一 ID
   */
  private generateId(): string {
    return Math.random().toString(36).substring(2, 11);
  }
}
#!/usr/bin/env node

import axios from 'axios';

/**
 * Claude Code Gateway 工具使用完整示例
 * 
 * 这个示例展示了如何：
 * 1. 发送带工具的请求
 * 2. 获取工具调用信息
 * 3. 执行工具
 * 4. 将结果发回继续对话
 */

const API_BASE = 'http://localhost:3000/v1';

async function main() {
  console.log('=== Claude Code Gateway 工具使用示例 ===\n');

  // 步骤 1: 发送初始请求，让 Claude 决定使用哪个工具
  console.log('1. 发送请求：计算一个数学表达式...');
  
  const initialRequest = {
    model: 'custom-claude-4-sonnet',
    messages: [
      {
        role: 'user',
        content: '请帮我计算 (25 + 17) * 3 - 8 的结果，并解释计算过程'
      }
    ],
    tools: [
      {
        type: 'function',
        function: {
          name: 'mcp__gateway__calculate',
          description: '执行数学计算',
          parameters: {
            type: 'object',
            properties: {
              expression: {
                type: 'string',
                description: '要计算的数学表达式'
              }
            },
            required: ['expression']
          }
        }
      }
    ],
    max_tokens: 200
  };

  try {
    const response1 = await axios.post(`${API_BASE}/chat/completions`, initialRequest, {
      headers: { 'Content-Type': 'application/json' }
    });

    console.log('\n响应:');
    console.log(JSON.stringify(response1.data, null, 2));

    // 检查是否有工具调用
    const toolCalls = response1.data.choices[0].message.tool_calls;
    if (!toolCalls || toolCalls.length === 0) {
      console.log('\nClaude 没有调用工具，直接返回了答案。');
      return;
    }

    console.log('\n2. Claude 请求调用工具:');
    console.log(JSON.stringify(toolCalls, null, 2));

    // 步骤 2: 执行工具调用（在实际应用中，这一步由客户端执行）
    console.log('\n3. 执行工具调用...');
    
    const toolResults = [];
    for (const toolCall of toolCalls) {
      const { name, arguments: args } = toolCall.function;
      
      // 解析参数
      const parsedArgs = JSON.parse(args);
      console.log(`\n执行工具: ${name}`);
      console.log(`参数: ${JSON.stringify(parsedArgs)}`);
      
      // 这里我们模拟执行计算
      // 在实际应用中，你可能会调用真实的 API 或执行实际的计算
      let result;
      if (name === 'calculate') {
        try {
          // 简单的计算实现（生产环境应使用更安全的方法）
          result = eval(parsedArgs.expression);
        } catch (error) {
          result = `计算错误: ${error.message}`;
        }
      }
      
      toolResults.push({
        tool_call_id: toolCall.id,
        output: JSON.stringify({ result })
      });
      
      console.log(`结果: ${result}`);
    }

    // 步骤 3: 将工具执行结果发回，继续对话
    console.log('\n4. 将结果发回给 Claude...');
    
    const followUpRequest = {
      model: 'custom-claude-4-sonnet',
      messages: [
        ...initialRequest.messages,
        response1.data.choices[0].message, // Claude 的工具调用请求
        {
          role: 'tool',
          content: toolResults[0].output,
          tool_call_id: toolResults[0].tool_call_id
        }
      ],
      tools: initialRequest.tools, // 保持工具定义
      max_tokens: 200
    };

    const response2 = await axios.post(`${API_BASE}/chat/completions`, followUpRequest, {
      headers: { 'Content-Type': 'application/json' }
    });

    console.log('\n最终响应:');
    console.log(response2.data.choices[0].message.content);

  } catch (error) {
    console.error('错误:', error.response?.data || error.message);
  }
}

// 运行示例
main().catch(console.error);
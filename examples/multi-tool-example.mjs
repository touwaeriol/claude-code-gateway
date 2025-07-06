#!/usr/bin/env node

import axios from 'axios';

/**
 * Claude Code Gateway 多工具使用示例
 * 
 * 展示如何使用多个工具完成复杂任务
 */

const API_BASE = 'http://localhost:3000/v1';

// 定义所有可用的工具
const AVAILABLE_TOOLS = [
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
            description: '数学表达式'
          }
        },
        required: ['expression']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'mcp__gateway__search',
      description: '搜索信息',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: '搜索查询'
          },
          limit: {
            type: 'number',
            description: '结果数量',
            default: 5
          }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'mcp__gateway__get_weather',
      description: '获取天气信息',
      parameters: {
        type: 'object',
        properties: {
          location: {
            type: 'string',
            description: '地点'
          },
          units: {
            type: 'string',
            enum: ['celsius', 'fahrenheit'],
            default: 'celsius'
          }
        },
        required: ['location']
      }
    }
  }
];

async function executeToolCall(toolCall) {
  const { name, arguments: args } = toolCall.function;
  const parsedArgs = JSON.parse(args);
  
  console.log(`\n执行工具: ${name}`);
  console.log(`参数: ${JSON.stringify(parsedArgs, null, 2)}`);
  
  // 模拟工具执行
  let result;
  switch (name) {
    case 'calculate':
      try {
        result = { result: eval(parsedArgs.expression) };
      } catch (error) {
        result = { error: `计算错误: ${error.message}` };
      }
      break;
      
    case 'search':
      result = {
        query: parsedArgs.query,
        results: [
          { title: `关于 ${parsedArgs.query} 的结果 1`, snippet: '这是第一个搜索结果...' },
          { title: `关于 ${parsedArgs.query} 的结果 2`, snippet: '这是第二个搜索结果...' }
        ].slice(0, parsedArgs.limit || 5)
      };
      break;
      
    case 'get_weather':
      result = {
        location: parsedArgs.location,
        temperature: Math.floor(Math.random() * 20) + 15,
        units: parsedArgs.units || 'celsius',
        conditions: ['晴朗', '多云', '小雨'][Math.floor(Math.random() * 3)],
        humidity: Math.floor(Math.random() * 30) + 50
      };
      break;
      
    default:
      result = { error: `未知工具: ${name}` };
  }
  
  console.log(`结果: ${JSON.stringify(result, null, 2)}`);
  
  return {
    tool_call_id: toolCall.id,
    output: JSON.stringify(result)
  };
}

async function chat(messages, expectToolCalls = false) {
  const request = {
    model: 'custom-claude-4-sonnet',
    messages: messages,
    tools: AVAILABLE_TOOLS,
    max_tokens: 500
  };
  
  const response = await axios.post(`${API_BASE}/chat/completions`, request, {
    headers: { 'Content-Type': 'application/json' }
  });
  
  const message = response.data.choices[0].message;
  
  if (message.tool_calls && message.tool_calls.length > 0) {
    console.log('\nClaude 请求使用工具:');
    
    // 执行所有工具调用
    const toolResults = [];
    for (const toolCall of message.tool_calls) {
      const result = await executeToolCall(toolCall);
      toolResults.push(result);
    }
    
    // 将结果添加到对话历史
    const updatedMessages = [
      ...messages,
      message, // Claude 的工具调用请求
      ...toolResults.map(result => ({
        role: 'tool',
        content: result.output,
        tool_call_id: result.tool_call_id
      }))
    ];
    
    // 继续对话
    return chat(updatedMessages, false);
  } else {
    // Claude 返回了最终答案
    return message.content;
  }
}

async function main() {
  console.log('=== Claude Code Gateway 多工具使用示例 ===\n');
  
  try {
    // 示例 1: 天气查询
    console.log('\n示例 1: 查询天气');
    console.log('用户: 北京今天天气怎么样？');
    
    let result = await chat([
      { role: 'user', content: '北京今天天气怎么样？' }
    ]);
    console.log(`\nClaude: ${result}`);
    
    // 示例 2: 计算和搜索
    console.log('\n\n示例 2: 复杂任务');
    console.log('用户: 帮我计算一下如果我每天存100元，一年能存多少钱？另外搜索一下"理财建议"');
    
    result = await chat([
      { 
        role: 'user', 
        content: '帮我计算一下如果我每天存100元，一年能存多少钱？另外搜索一下"理财建议"' 
      }
    ]);
    console.log(`\nClaude: ${result}`);
    
    // 示例 3: 多地天气对比
    console.log('\n\n示例 3: 多地天气对比');
    console.log('用户: 比较一下北京、上海和广州的天气');
    
    result = await chat([
      { role: 'user', content: '比较一下北京、上海和广州的天气' }
    ]);
    console.log(`\nClaude: ${result}`);
    
  } catch (error) {
    console.error('\n错误:', error.response?.data || error.message);
  }
}

// 运行示例
main().catch(console.error);
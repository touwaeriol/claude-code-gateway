#!/usr/bin/env node

import axios from 'axios';

const API_BASE = 'http://localhost:3000/v1';

// 工具定义
const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'mcp__gateway__calculate',
      description: '执行数学计算',
      parameters: {
        type: 'object',
        properties: {
          expression: { type: 'string' }
        },
        required: ['expression']
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
          location: { type: 'string' },
          units: { type: 'string', enum: ['celsius', 'fahrenheit'] }
        },
        required: ['location']
      }
    }
  }
];

async function demonstrateTools() {
  console.log('🎯 Claude Gateway 工具演示\n');

  // 演示 1: 简单计算
  console.log('📌 演示 1: 数学计算');
  console.log('用户: 计算 25 * 4 + 10');
  
  let messages = [{ role: 'user', content: '计算 25 * 4 + 10' }];
  
  // 第一次请求 - AI 决定使用工具
  let response = await axios.post(`${API_BASE}/chat/completions`, {
    model: 'custom-claude-4-sonnet',
    messages,
    tools: TOOLS,
    max_tokens: 200
  });

  let aiMessage = response.data.choices[0].message;
  console.log('\nAI 响应:', aiMessage.content || '(准备使用工具)');
  
  if (aiMessage.tool_calls) {
    console.log('AI 调用工具:', JSON.stringify(aiMessage.tool_calls[0].function));
    
    // 模拟执行工具
    const args = JSON.parse(aiMessage.tool_calls[0].function.arguments);
    const result = eval(args.expression);
    console.log('工具执行结果:', result);
    
    // 发送结果回 AI
    messages.push(aiMessage);
    messages.push({
      role: 'tool',
      content: JSON.stringify({ result }),
      tool_call_id: aiMessage.tool_calls[0].id
    });
    
    response = await axios.post(`${API_BASE}/chat/completions`, {
      model: 'custom-claude-4-sonnet',
      messages,
      tools: TOOLS,
      max_tokens: 200
    });
    
    console.log('\nAI 最终回答:', response.data.choices[0].message.content);
  }

  // 演示 2: 天气查询
  console.log('\n\n📌 演示 2: 天气查询');
  console.log('用户: 北京天气怎么样？');
  
  messages = [{ role: 'user', content: '北京天气怎么样？' }];
  
  response = await axios.post(`${API_BASE}/chat/completions`, {
    model: 'custom-claude-4-sonnet',
    messages,
    tools: TOOLS,
    max_tokens: 200
  });

  aiMessage = response.data.choices[0].message;
  console.log('\nAI 响应:', aiMessage.content || '(准备使用工具)');
  
  if (aiMessage.tool_calls) {
    console.log('AI 调用工具:', JSON.stringify(aiMessage.tool_calls[0].function));
    
    // 模拟天气数据
    const weatherData = {
      location: '北京',
      temperature: 22,
      units: 'celsius',
      condition: '晴朗',
      humidity: 65
    };
    console.log('工具返回数据:', weatherData);
    
    messages.push(aiMessage);
    messages.push({
      role: 'tool',
      content: JSON.stringify(weatherData),
      tool_call_id: aiMessage.tool_calls[0].id
    });
    
    response = await axios.post(`${API_BASE}/chat/completions`, {
      model: 'custom-claude-4-sonnet',
      messages,
      tools: TOOLS,
      max_tokens: 200
    });
    
    console.log('\nAI 最终回答:', response.data.choices[0].message.content);
  }

  console.log('\n✅ 演示完成！');
}

demonstrateTools().catch(console.error);
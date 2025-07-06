#!/usr/bin/env node

import axios from 'axios';
import readline from 'readline';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * 交互式客户端 - 模拟真实的 OpenAI 客户端行为
 * 自动处理工具调用，让 AI 可以使用工具完成任务
 */

const API_BASE = 'http://localhost:3000/v1';

// 定义可用工具
const AVAILABLE_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'mcp__gateway__calculate',
      description: '执行数学计算，支持基本运算符 +, -, *, /, ^ 和括号',
      parameters: {
        type: 'object',
        properties: {
          expression: {
            type: 'string',
            description: '要计算的数学表达式，例如: "2 + 3 * 4" 或 "(10 + 5) / 3"'
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
      description: '搜索互联网上的信息',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: '搜索查询词'
          },
          limit: {
            type: 'number',
            description: '返回结果数量限制',
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
      description: '获取指定地点的天气信息',
      parameters: {
        type: 'object',
        properties: {
          location: {
            type: 'string',
            description: '城市或地点名称'
          },
          units: {
            type: 'string',
            enum: ['celsius', 'fahrenheit'],
            description: '温度单位',
            default: 'celsius'
          }
        },
        required: ['location']
      }
    }
  }
];

// 模拟工具执行
class ToolExecutor {
  async execute(toolName, args) {
    console.log(`\n🔧 执行工具: ${toolName}`);
    console.log(`📋 参数: ${JSON.stringify(args, null, 2)}`);
    
    switch (toolName) {
      case 'calculate':
        return this.calculate(args);
      case 'search':
        return this.search(args);
      case 'get_weather':
        return this.getWeather(args);
      default:
        throw new Error(`未知工具: ${toolName}`);
    }
  }

  calculate(args) {
    try {
      // 安全的数学表达式计算
      const expression = args.expression;
      // 替换 ^ 为 **（幂运算）
      const safeExpression = expression.replace(/\^/g, '**');
      // 只允许数字、运算符和括号
      if (!/^[0-9+\-*/().\s**]+$/.test(safeExpression)) {
        throw new Error('表达式包含非法字符');
      }
      
      const result = Function('"use strict"; return (' + safeExpression + ')')();
      
      console.log(`✅ 计算结果: ${result}`);
      return {
        expression: args.expression,
        result: result,
        success: true
      };
    } catch (error) {
      console.log(`❌ 计算错误: ${error.message}`);
      return {
        expression: args.expression,
        error: error.message,
        success: false
      };
    }
  }

  search(args) {
    // 模拟搜索结果
    const query = args.query;
    const limit = args.limit || 5;
    
    const mockResults = [
      {
        title: `${query} - 维基百科`,
        url: `https://zh.wikipedia.org/wiki/${encodeURIComponent(query)}`,
        snippet: `${query} 是一个由 Anthropic 开发的大型语言模型...`
      },
      {
        title: `深入了解 ${query} 的技术原理`,
        url: `https://example.com/tech/${encodeURIComponent(query)}`,
        snippet: `本文详细介绍 ${query} 的技术架构和实现原理...`
      },
      {
        title: `${query} 使用指南`,
        url: `https://docs.example.com/${encodeURIComponent(query)}`,
        snippet: `学习如何有效使用 ${query} 进行各种任务...`
      },
      {
        title: `${query} vs GPT-4 对比`,
        url: `https://comparison.com/${encodeURIComponent(query)}`,
        snippet: `全面对比 ${query} 和其他 AI 模型的性能差异...`
      },
      {
        title: `${query} 最新更新`,
        url: `https://news.example.com/${encodeURIComponent(query)}`,
        snippet: `了解 ${query} 的最新功能更新和改进...`
      }
    ];

    const results = mockResults.slice(0, limit);
    console.log(`✅ 找到 ${results.length} 条结果`);
    
    return {
      query: query,
      results: results,
      total: results.length,
      success: true
    };
  }

  getWeather(args) {
    // 模拟天气数据
    const location = args.location;
    const units = args.units || 'celsius';
    
    // 生成随机天气数据
    const conditions = ['晴朗', '多云', '小雨', '阴天', '局部多云'];
    const condition = conditions[Math.floor(Math.random() * conditions.length)];
    
    let temperature = Math.floor(Math.random() * 30) + 10; // 10-40°C
    if (units === 'fahrenheit') {
      temperature = Math.floor(temperature * 9/5 + 32);
    }
    
    const humidity = Math.floor(Math.random() * 40) + 40; // 40-80%
    const windSpeed = Math.floor(Math.random() * 20) + 5; // 5-25 km/h
    
    console.log(`✅ 获取到 ${location} 的天气数据`);
    
    return {
      location: location,
      temperature: temperature,
      units: units,
      condition: condition,
      humidity: humidity,
      windSpeed: windSpeed,
      windDirection: '东北',
      success: true,
      timestamp: new Date().toISOString()
    };
  }
}

// 对话客户端
class ConversationClient {
  constructor() {
    this.messages = [];
    this.toolExecutor = new ToolExecutor();
  }

  async sendMessage(content) {
    // 添加用户消息
    this.messages.push({ role: 'user', content });
    
    // 发送请求
    const response = await this.makeRequest();
    
    // 处理响应
    return this.processResponse(response);
  }

  async makeRequest() {
    const request = {
      model: 'custom-claude-4-sonnet',
      messages: this.messages,
      tools: AVAILABLE_TOOLS,
      max_tokens: 500,
      temperature: 0.7
    };

    try {
      const response = await axios.post(`${API_BASE}/chat/completions`, request, {
        headers: { 'Content-Type': 'application/json' }
      });
      return response.data;
    } catch (error) {
      throw new Error(`API 错误: ${error.response?.data?.error || error.message}`);
    }
  }

  async processResponse(response) {
    const message = response.choices[0].message;
    
    // 添加助手消息到历史
    this.messages.push(message);
    
    // 检查是否有工具调用
    if (message.tool_calls && message.tool_calls.length > 0) {
      console.log('\n🤖 AI 请求使用以下工具:');
      
      // 执行所有工具调用
      for (const toolCall of message.tool_calls) {
        const toolName = toolCall.function.name.replace(/^mcp__gateway__/, '');
        const args = JSON.parse(toolCall.function.arguments);
        
        try {
          // 执行工具
          const result = await this.toolExecutor.execute(toolName, args);
          
          // 添加工具结果到消息历史
          this.messages.push({
            role: 'tool',
            content: JSON.stringify(result),
            tool_call_id: toolCall.id
          });
        } catch (error) {
          // 添加错误结果
          this.messages.push({
            role: 'tool',
            content: JSON.stringify({ error: error.message, success: false }),
            tool_call_id: toolCall.id
          });
        }
      }
      
      // 继续对话，获取最终响应
      console.log('\n🔄 将结果发送给 AI...');
      const followUpResponse = await this.makeRequest();
      return this.processResponse(followUpResponse);
    } else {
      // 返回最终响应
      return message.content;
    }
  }

  reset() {
    this.messages = [];
    console.log('\n🔄 对话已重置\n');
  }
}

// 主程序
async function main() {
  console.log('🚀 Claude Code Gateway 交互式客户端');
  console.log('=====================================');
  console.log('这是一个模拟 OpenAI 客户端，会自动处理工具调用。');
  console.log('AI 可以使用以下工具:');
  console.log('  - 计算器 (calculate)');
  console.log('  - 搜索引擎 (search)');
  console.log('  - 天气查询 (get_weather)');
  console.log('\n输入 "exit" 退出，"reset" 重置对话\n');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const client = new ConversationClient();

  // 示例对话
  const examples = [
    '计算 123 * 456 + 789',
    '搜索一下 Claude AI 的最新信息',
    '查询北京、上海、广州的天气',
    '帮我计算如果我每月存5000元，年利率3%，5年后有多少钱？',
    '搜索"人工智能"并告诉我最新的发展趋势'
  ];

  console.log('💡 示例问题:');
  examples.forEach((ex, i) => console.log(`  ${i + 1}. ${ex}`));
  console.log('');

  const askQuestion = () => {
    rl.question('👤 你: ', async (input) => {
      if (input.toLowerCase() === 'exit') {
        console.log('\n👋 再见！');
        rl.close();
        process.exit(0);
      }

      if (input.toLowerCase() === 'reset') {
        client.reset();
        askQuestion();
        return;
      }

      try {
        console.log('\n⏳ AI 正在思考...');
        const response = await client.sendMessage(input);
        console.log(`\n🤖 AI: ${response}\n`);
      } catch (error) {
        console.error(`\n❌ 错误: ${error.message}\n`);
      }

      askQuestion();
    });
  };

  askQuestion();
}

// 启动客户端
main().catch(console.error);
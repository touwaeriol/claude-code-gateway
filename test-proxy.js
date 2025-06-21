import axios from 'axios';

const API_BASE = 'http://localhost:3000/v1';

async function testChat() {
  console.log('测试基础对话...');
  try {
    const response = await axios.post(`${API_BASE}/chat/completions`, {
      model: 'custom-claude-4-sonnet',
      messages: [
        { role: 'user', content: '你好！请简单介绍一下你自己。' }
      ],
      max_tokens: 200
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-key'
      }
    });

    console.log('响应:', response.data.choices[0].message.content);
  } catch (error) {
    console.error('错误:', error.response?.data || error.message);
  }
}

async function testFunctionCalling() {
  console.log('\n测试工具调用...');
  try {
    const response = await axios.post(`${API_BASE}/chat/completions`, {
      model: 'custom-claude-4-opus',
      messages: [
        { role: 'user', content: '北京今天的天气怎么样？' }
      ],
      tools: [{
        type: 'function',
        function: {
          name: 'get_weather',
          description: '获取指定城市的天气信息',
          parameters: {
            type: 'object',
            properties: {
              location: {
                type: 'string',
                description: '城市名称，如：北京、上海'
              },
              unit: {
                type: 'string',
                enum: ['celsius', 'fahrenheit'],
                description: '温度单位'
              }
            },
            required: ['location']
          }
        }
      }],
      tool_choice: 'auto'
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-key'
      }
    });

    const message = response.data.choices[0].message;
    if (message.tool_calls) {
      console.log('工具调用:');
      message.tool_calls.forEach(toolCall => {
        console.log(`- 函数: ${toolCall.function.name}`);
        console.log(`  参数: ${toolCall.function.arguments}`);
      });
    }
    if (message.content) {
      console.log('文本响应:', message.content);
    }
  } catch (error) {
    console.error('错误:', error.response?.data || error.message);
  }
}

async function testStream() {
  console.log('\n测试流式响应...');
  try {
    const response = await axios.post(`${API_BASE}/chat/completions`, {
      model: 'custom-claude-4-sonnet',
      messages: [
        { role: 'user', content: '写一个关于春天的俳句' }
      ],
      stream: true
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-key',
        'Accept': 'text/event-stream'
      },
      responseType: 'stream'
    });

    response.data.on('data', chunk => {
      const lines = chunk.toString().split('\n');
      lines.forEach(line => {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') {
            console.log('\n流式响应完成');
          } else {
            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices[0].delta?.content;
              if (content) {
                process.stdout.write(content);
              }
            } catch (e) {
              // 忽略解析错误
            }
          }
        }
      });
    });

    response.data.on('end', () => {
      console.log('\n');
    });
  } catch (error) {
    console.error('错误:', error.response?.data || error.message);
  }
}

async function testModels() {
  console.log('\n测试模型列表...');
  try {
    const response = await axios.get(`${API_BASE}/models`, {
      headers: {
        'Authorization': 'Bearer test-key'
      }
    });

    console.log('可用模型:');
    response.data.data.forEach(model => {
      console.log(`- ${model.id}`);
    });
  } catch (error) {
    console.error('错误:', error.response?.data || error.message);
  }
}

async function runTests() {
  console.log('开始测试 Claude OpenAI 代理服务...\n');
  
  await testModels();
  await testChat();
  await testFunctionCalling();
  await testStream();
}

// 等待服务启动后运行
setTimeout(runTests, 2000);
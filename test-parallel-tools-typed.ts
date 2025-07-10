/**
 * 测试 parallel_tool_calls 参数（类型安全版本）
 */

import type { ChatCompletionCreateParams } from 'openai/resources/chat/completions';

async function testParallelToolCalls() {
    // 创建类型安全的请求
    const request: ChatCompletionCreateParams = {
        model: 'custom-claude-4-sonnet',
        messages: [
            {
                role: 'user',
                content: '创建两个文件：test1.txt (内容: "Hello") 和 test2.txt (内容: "World")'
            }
        ],
        tools: [
            {
                type: 'function',
                function: {
                    name: 'create_file',
                    description: '创建文件',
                    parameters: {
                        type: 'object',
                        properties: {
                            filename: { type: 'string' },
                            content: { type: 'string' }
                        },
                        required: ['filename', 'content']
                    }
                }
            }
        ],
        parallel_tool_calls: false  // TypeScript 会检查这个属性
    };

    console.log('发送请求 (parallel_tool_calls: false)...\n');
    
    const response = await fetch('http://localhost:3000/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(request)
    });

    const result = await response.json();
    console.log('响应:', JSON.stringify(result, null, 2));
}

testParallelToolCalls().catch(console.error);
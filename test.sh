#!/bin/bash

# Claude Code Gateway 快速测试脚本

API_BASE="http://localhost:3000"

echo "🧪 Claude Code Gateway 测试"
echo "=========================="
echo ""

# 1. 健康检查
echo "1️⃣ 健康检查..."
curl -s ${API_BASE}/health | jq '.'
echo ""

# 2. 基本对话
echo "2️⃣ 基本对话测试..."
curl -s -X POST ${API_BASE}/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "custom-claude-4-sonnet",
    "messages": [{"role": "user", "content": "Say hello in one word"}],
    "max_tokens": 50
  }' | jq '.choices[0].message.content'
echo ""

# 3. 工具调用测试
echo "3️⃣ 工具调用测试..."
curl -s -X POST ${API_BASE}/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "custom-claude-4-sonnet",
    "messages": [{"role": "user", "content": "Calculate 25 * 4"}],
    "tools": [{
      "type": "function",
      "function": {
        "name": "mcp__gateway__calculate",
        "description": "Calculate math expressions",
        "parameters": {
          "type": "object",
          "properties": {
            "expression": {"type": "string"}
          },
          "required": ["expression"]
        }
      }
    }],
    "max_tokens": 100
  }' | jq '.choices[0].message.tool_calls'

echo ""
echo "✅ 测试完成！"
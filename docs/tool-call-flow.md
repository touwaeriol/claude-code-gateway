# 工具调用流程说明

## 概述

Claude Code Gateway 支持 OpenAI 兼容的工具调用流程，允许客户端通过标准的 OpenAI API 与 Claude Code 进行交互，并执行工具调用。

## 重要说明

### MCP 协议限制
- **一次请求，一次响应**：即使是 HTTP streamable MCP，也遵循标准的请求-响应模式
- **不支持流式工具结果**：工具调用结果必须一次性完整返回
- **工具调用 ID**：使用 JSON-RPC 请求 ID 作为工具调用 ID，简化 ID 管理

### 客户端要求
- **完整结果**：客户端必须一次性发送完整的工具调用结果
- **不支持分片**：不支持将工具结果分多次发送
- **支持批量**：可以在一个请求中发送多个工具调用结果

### 多轮对话支持
- **支持多次工具调用**：Claude Code SDK 现在配置为 `maxTurns: 10`，支持在单个会话中进行多次工具调用往返
- **会话缓存**：通过消息快照缓存机制，即使客户端使用无状态 HTTP，也能恢复和继续 SDK 会话
- **智能会话管理**：系统会自动匹配消息历史，恢复相应的 Claude Code SDK 会话

## 工具调用流程

### 1. 初始请求

客户端发送包含工具定义的请求：

```bash
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "custom-claude-4-sonnet",
    "messages": [
      {
        "role": "user",
        "content": "请帮我计算 123 + 456"
      }
    ],
    "tools": [{
      "type": "function",
      "function": {
        "name": "calculate",
        "description": "执行数学计算",
        "parameters": {
          "type": "object",
          "properties": {
            "expression": {
              "type": "string",
              "description": "数学表达式"
            }
          },
          "required": ["expression"]
        }
      }
    }]
  }'
```

### 2. 服务器响应工具调用

服务器返回工具调用请求：

```json
{
  "id": "chatcmpl-xxx",
  "object": "chat.completion",
  "created": 1234567890,
  "model": "custom-claude-4-sonnet",
  "choices": [{
    "index": 0,
    "message": {
      "role": "assistant",
      "content": null,
      "tool_calls": [{
        "id": "call_abc123",
        "type": "function",
        "function": {
          "name": "calculate",
          "arguments": "{\"expression\": \"123 + 456\"}"
        }
      }]
    },
    "finish_reason": "tool_calls"
  }],
  "usage": {...}
}
```

### 3. 客户端执行工具并返回结果

客户端执行工具调用并将结果发送回服务器：

```bash
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "X-Session-ID: <会话ID>" \
  -d '{
    "model": "custom-claude-4-sonnet",
    "messages": [
      {
        "role": "user",
        "content": "请帮我计算 123 + 456"
      },
      {
        "role": "assistant",
        "content": null,
        "tool_calls": [{
          "id": "call_abc123",
          "type": "function",
          "function": {
            "name": "calculate",
            "arguments": "{\"expression\": \"123 + 456\"}"
          }
        }]
      },
      {
        "role": "tool",
        "content": "579",
        "tool_call_id": "call_abc123"
      }
    ]
  }'
```

### 4. 最终响应

服务器处理工具调用结果并返回最终响应：

```json
{
  "id": "chatcmpl-yyy",
  "object": "chat.completion",
  "created": 1234567891,
  "model": "custom-claude-4-sonnet",
  "choices": [{
    "index": 0,
    "message": {
      "role": "assistant",
      "content": "123 + 456 的结果是 579。"
    },
    "finish_reason": "stop"
  }],
  "usage": {...}
}
```

## 实现细节

### 会话管理

- 每个会话都有唯一的会话ID
- 会话ID通过 `X-Session-ID` header 传递
- 会话会记录允许的工具列表

### 权限控制

- 所有工具调用都经过权限验证
- 使用 MCP 权限服务器进行工具调用审批
- 只有客户端提供的工具才能被调用

### 工具调用管理

- 使用 `ToolCallManager` 管理待处理的工具调用
- 支持异步阻塞等待工具调用结果
- 自动超时处理（2分钟）

### 虚拟 MCP 服务器

- `mcp__auth__`: 权限控制服务器
- `mcp__gateway__`: 工具网关服务器

## 错误处理

- 工具调用超时：返回超时错误
- 权限拒绝：返回权限错误
- 会话不存在：返回会话错误

## 流式响应

流式响应也支持工具调用，工具调用信息会通过 SSE (Server-Sent Events) 格式返回。

```
data: {"id":"chatcmpl-xxx","object":"chat.completion.chunk","created":1234567890,"model":"custom-claude-4-sonnet","choices":[{"index":0,"delta":{"tool_calls":[{"id":"call_abc123","type":"function","function":{"name":"calculate","arguments":"{\"expression\": \"123 + 456\"}"}}]},"finish_reason":null}]}

data: {"id":"chatcmpl-xxx","object":"chat.completion.chunk","created":1234567890,"model":"custom-claude-4-sonnet","choices":[{"index":0,"delta":{},"finish_reason":"tool_calls"}]}

data: [DONE]
```
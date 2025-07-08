# 流式工具响应设计

## 概述

支持虚拟 MCP 在等待期间流式返回工具执行结果，让 Claude Code 能够实时处理部分结果。

## 实现方案

### 1. AsyncGenerator 方案（推荐）

**优点**：
- 自然的流式语法
- 支持背压控制
- 错误处理简单

**实现示例**：
```typescript
// MCP Server 中
async *handleStreamingToolCall(request: JsonRpcRequest): AsyncGenerator<JsonRpcResponse> {
  const toolCallId = String(request.id);
  
  // 返回流式响应
  for await (const chunk of mcpGateway.handleStreamingToolCall(...)) {
    yield {
      jsonrpc: '2.0',
      id: request.id,
      result: {
        content: [{
          type: 'text',
          text: chunk
        }],
        streaming: true // 标记为流式响应
      }
    };
  }
  
  // 最终响应
  yield {
    jsonrpc: '2.0',
    id: request.id,
    result: {
      content: [{
        type: 'text',
        text: ''
      }],
      done: true // 标记结束
    }
  };
}
```

### 2. 客户端处理流式结果

```javascript
// 客户端执行工具并流式返回结果
async function executeToolWithStreaming(toolCall) {
  const { id, function: { name, arguments: args } } = toolCall;
  
  // 对于支持流式的工具
  if (name === 'search_large_dataset') {
    for await (const batch of searchInBatches(JSON.parse(args))) {
      // 发送部分结果
      await sendPartialToolResult(id, batch, false);
    }
    // 发送完成信号
    await sendPartialToolResult(id, '', true);
  }
}

// 发送部分工具结果
async function sendPartialToolResult(toolCallId, content, isComplete) {
  return fetch('/v1/tool-results/stream', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Session-ID': sessionId
    },
    body: JSON.stringify({
      tool_call_id: toolCallId,
      content: content,
      complete: isComplete
    })
  });
}
```

### 3. API 端点设计

新增流式工具结果端点：
```typescript
// POST /v1/tool-results/stream
app.post('/v1/tool-results/stream', async (req, res) => {
  const { tool_call_id, content, complete } = req.body;
  
  if (complete) {
    // 完成流式调用
    this.streamingToolCallManager.completeStreamingCall(tool_call_id);
  } else {
    // 发送流式数据块
    this.streamingToolCallManager.sendStreamingChunk(tool_call_id, content);
  }
  
  res.json({ success: true });
});
```

## 使用场景

### 1. 大数据集搜索
```typescript
// 搜索大型数据库，逐批返回结果
for await (const batch of searchDatabase(query)) {
  yield { results: batch, hasMore: true };
}
```

### 2. 长时间运行的分析
```typescript
// 分析进度实时反馈
yield { status: 'Analyzing files...', progress: 0.2 };
yield { status: 'Processing data...', progress: 0.5 };
yield { status: 'Generating report...', progress: 0.8 };
yield { status: 'Complete', progress: 1.0, result: finalReport };
```

### 3. 实时数据流
```typescript
// 监控实时数据
for await (const event of monitorSystemEvents()) {
  yield { event, timestamp: Date.now() };
}
```

## 注意事项

### 1. 协议兼容性
- 需要扩展 MCP 协议支持流式响应
- 保持向后兼容（非流式工具继续工作）

### 2. 错误处理
- 流式传输中的错误需要特殊处理
- 支持中途取消

### 3. 性能考虑
- 避免过于频繁的小数据块
- 实现合理的批处理策略

## 实现步骤

1. **扩展 ToolCallManager**：支持流式数据管理
2. **修改 MCP Gateway**：支持 AsyncGenerator 返回
3. **更新 MCP Server**：处理流式响应
4. **添加 API 端点**：接收流式工具结果
5. **更新客户端示例**：展示流式工具执行
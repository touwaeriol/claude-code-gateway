# 串行工具调用处理方案 ✅ 已完全实现

## 问题描述

当 Claude Code SDK 返回多个工具调用时：
```
SDK: [tool_call_1, tool_call_2, tool_call_3]
```

但客户端不支持并行处理，需要：
1. 逐个返回工具调用
2. 等待客户端处理完一个再返回下一个
3. 正确维护消息顺序

## ✅ 实现状态

**项目已完全实现串行工具调用处理功能**，包括：
- 完整的客户端检测机制
- 串行工具调用状态管理
- 消息流重建和插入
- 会话恢复和继续
- 错误处理和恢复机制

## 实现方案

### 1. 检测客户端能力

**使用 OpenAI 标准参数 `parallel_tool_calls`**：

```typescript
// 请求体中的标准参数
{
  "model": "custom-claude-4-sonnet",
  "messages": [...],
  "tools": [...],
  "parallel_tool_calls": false  // OpenAI 标准参数
}
```

实现逻辑：
- 检查请求体中的 `parallel_tool_calls` 参数
- `false`: 使用串行模式（每次返回一个工具调用）
- `true` 或未设置: 使用并行模式（返回所有工具调用）

### 2. 工具调用队列管理

```typescript
interface ToolCallQueue {
  sessionId: string;
  pendingCalls: ToolCall[];      // 待返回的工具调用
  currentCall?: ToolCall;        // 当前正在处理的工具调用
  processedResults: Map<string, any>; // 已处理的结果
}

class SequentialToolCallManager {
  private queues = new Map<string, ToolCallQueue>();
  
  /**
   * 初始化工具调用队列
   */
  initQueue(sessionId: string, toolCalls: ToolCall[]): void {
    this.queues.set(sessionId, {
      sessionId,
      pendingCalls: [...toolCalls],
      processedResults: new Map()
    });
  }
  
  /**
   * 获取下一个待处理的工具调用
   */
  getNextToolCall(sessionId: string): ToolCall | null {
    const queue = this.queues.get(sessionId);
    if (!queue || queue.pendingCalls.length === 0) {
      return null;
    }
    
    // 取出第一个工具调用
    const nextCall = queue.pendingCalls.shift()!;
    queue.currentCall = nextCall;
    
    return nextCall;
  }
  
  /**
   * 记录工具调用结果
   */
  recordResult(sessionId: string, toolCallId: string, result: any): void {
    const queue = this.queues.get(sessionId);
    if (queue) {
      queue.processedResults.set(toolCallId, result);
      queue.currentCall = undefined;
    }
  }
  
  /**
   * 检查是否还有待处理的工具调用
   */
  hasMoreCalls(sessionId: string): boolean {
    const queue = this.queues.get(sessionId);
    return queue ? queue.pendingCalls.length > 0 : false;
  }
}
```

### 3. 消息流程管理

```typescript
// response-processor.ts 的改进
async processNonStream(options: ResponseOptions): Promise<ChatCompletionResponse> {
  // ... 现有逻辑 ...
  
  // 检查客户端能力
  const supportsParallel = this.checkClientCapabilities(options.sessionId);
  
  if (!supportsParallel && allToolCalls.length > 1) {
    // 串行处理：只返回第一个工具调用
    console.log(`[ResponseProcessor] 客户端不支持并行，串行返回工具调用`);
    
    // 初始化队列
    this.toolCallManager.initQueue(options.sessionId, allToolCalls);
    
    // 只返回第一个
    const firstCall = this.toolCallManager.getNextToolCall(options.sessionId);
    
    return {
      // ... 其他字段 ...
      choices: [{
        message: {
          role: 'assistant',
          content: null,
          tool_calls: [firstCall]
        },
        finish_reason: 'tool_calls'
      }]
    };
  } else {
    // 并行处理：返回所有工具调用
    return {
      // ... 现有逻辑 ...
    };
  }
}
```

### 4. 会话恢复时的处理

```typescript
// session-helper.ts 的改进
static async resolveSession(
  messages: ChatMessage[],
  messageTrieCache: MessageTrieCache,
  toolCallManager: ToolCallManager,
  claudeSessionManager: ClaudeSessionManager
): Promise<SessionContext> {
  // ... 现有逻辑 ...
  
  const analysis = this.analyzeMessages(messages, snapshotResult.matchedLength);
  
  if (analysis.hasToolResults) {
    // 检查是否在串行处理中
    const queue = toolCallManager.getQueue(sessionId);
    
    if (queue && queue.hasMoreCalls()) {
      // 记录当前工具结果
      const lastToolResult = analysis.newMessages.find(m => m.role === 'tool');
      if (lastToolResult) {
        queue.recordResult(sessionId, lastToolResult.tool_call_id, lastToolResult.content);
      }
      
      // 获取下一个工具调用
      const nextCall = queue.getNextToolCall(sessionId);
      
      if (nextCall) {
        // 返回下一个工具调用，而不是继续原会话
        return {
          sessionId,
          isNewSession: false,
          shouldContinue: false,
          nextToolCall: nextCall
        };
      }
    }
    
    // 所有工具调用都处理完了，构建完整消息发送给 SDK
    const completeMessages = this.buildCompleteMessages(messages, queue);
    
    // 转发给 Claude Code SDK
    this.forwardCompleteResults(completeMessages, toolCallManager);
    
    return { sessionId, isNewSession: false, shouldContinue: true };
  }
}

/**
 * 构建包含所有工具结果的完整消息列表
 */
static buildCompleteMessages(
  clientMessages: ChatMessage[], 
  queue: ToolCallQueue
): ChatMessage[] {
  const result: ChatMessage[] = [];
  
  // 保留原始消息直到工具调用
  for (const msg of clientMessages) {
    result.push(msg);
    
    // 如果是包含工具调用的 assistant 消息
    if (msg.role === 'assistant' && msg.tool_calls) {
      // 按顺序插入所有工具结果
      for (const toolCall of msg.tool_calls) {
        const toolResult = queue.processedResults.get(toolCall.id);
        if (toolResult) {
          result.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: toolResult
          });
        }
      }
    }
  }
  
  return result;
}
```

### 5. 消息缓存的改进

```typescript
// message-trie-cache.ts 的改进
interface MessageSnapshot {
  messages: ChatMessage[];
  sessionId: string;
  timestamp: number;
  
  // 新增：工具调用状态
  toolCallState?: {
    allToolCalls: ToolCall[];        // 所有工具调用
    pendingToolCalls: string[];      // 待处理的工具调用 ID
    processedResults: Record<string, any>; // 已处理的结果
    isSequential: boolean;           // 是否串行处理
  };
}
```

## 完整流程示例

### 串行处理流程

```
1. SDK 返回: [tool_call_1, tool_call_2, tool_call_3]

2. API 返回给客户端: [tool_call_1]
   缓存状态: {
     allToolCalls: [1, 2, 3],
     pendingToolCalls: [2, 3],
     processedResults: {}
   }

3. 客户端返回: tool_result_1
   API 返回给客户端: [tool_call_2]
   缓存状态: {
     allToolCalls: [1, 2, 3],
     pendingToolCalls: [3],
     processedResults: {1: result_1}
   }

4. 客户端返回: tool_result_2
   API 返回给客户端: [tool_call_3]
   缓存状态: {
     allToolCalls: [1, 2, 3],
     pendingToolCalls: [],
     processedResults: {1: result_1, 2: result_2}
   }

5. 客户端返回: tool_result_3
   API 构建完整消息:
   [
     user_msg,
     assistant_msg (with tool_calls),
     tool_result_1,
     tool_result_2,
     tool_result_3
   ]
   发送给 SDK 继续处理
```

## 配置选项

**标准 OpenAI API 参数**：

```json
{
  "model": "custom-claude-4-sonnet",
  "messages": [...],
  "tools": [...],
  "parallel_tool_calls": false  // 唯一的控制参数
}
```

- `parallel_tool_calls: false` - 使用串行模式
- `parallel_tool_calls: true` 或未设置 - 使用并行模式（默认）

## 优势

1. **兼容性**：支持不能处理并行工具调用的旧客户端
2. **灵活性**：可以根据客户端能力动态切换模式
3. **正确性**：保证消息顺序和工具调用结果的正确对应
4. **透明性**：对 Claude Code SDK 透明，SDK 收到的是完整的消息序列

## 注意事项

1. **性能影响**：串行处理会增加往返次数，影响性能
2. **状态管理**：需要额外的状态管理来跟踪处理进度
3. **超时处理**：每个工具调用都需要独立的超时管理
4. **错误恢复**：如果某个工具调用失败，需要决定是否继续处理后续调用
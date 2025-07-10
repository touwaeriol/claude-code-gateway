# 多工具调用和会话状态管理改进方案

## Claude Code SDK 消息流详解

### SDK 消息类型
Claude Code SDK 会发送以下类型的消息：

1. **SDKSystemMessage** (`type: 'system'`) - 初始化消息，包含会话信息
2. **SDKAssistantMessage** (`type: 'assistant'`) - 助手响应，可能包含文本和/或工具调用
3. **SDKUserMessage** (`type: 'user'`) - 用户输入（主要用于流式输入）
4. **SDKResultMessage** (`type: 'result'`) - 最终结果，标志着 SDK 完成所有处理

### 关键行为：工具调用时的消息流

#### 场景1：SDK 等待工具调用结果
```
1. SDK → SDKSystemMessage (初始化)
2. SDK → SDKAssistantMessage (包含 tool_calls)
3. SDK → [暂停，等待工具结果，不发送 SDKResultMessage]
4. Client → 返回工具结果
5. SDK → 继续处理...
6. SDK → SDKAssistantMessage (最终响应)
7. SDK → SDKResultMessage (完成)
```

**重要**：当 SDK 发起工具调用后，它会**暂停**并等待结果，此时**不会**发送 `SDKResultMessage`。

#### 场景2：SDK 直接完成（无工具调用）
```
1. SDK → SDKSystemMessage (初始化)
2. SDK → SDKAssistantMessage (纯文本响应)
3. SDK → SDKResultMessage (完成)
```

#### 场景3：多个工具调用的处理
当 Claude Code SDK 需要调用多个工具时：

```
1. SDK 调用前: [user_msg]
2. SDK 返回: [SDKSystemMessage, SDKAssistantMessage(包含3个tool_calls)]
3. SDK 暂停，等待所有工具结果
4. 客户端处理第一个工具: [user_msg, tool_call_1, tool_result_1]
5. 客户端请求继续，需要正确处理 tool_call_2 和 tool_call_3
```

### 判断 SDK 状态的方法

#### SDK 消息流特性

Claude Code SDK 使用流式传输，即使在非流式 API 调用中也是如此：

1. **流式消息片段**：SDK 会发送多个 `assistant` 类型的消息片段
2. **stop_reason 通常为 null**：在流式传输过程中，大部分消息的 `stop_reason` 都是 `null`
3. **stop_reason: "tool_use"**：当 SDK 需要调用工具时，最后一个 assistant 消息会包含 `stop_reason: "tool_use"`
4. **result 消息**：SDK 通过 `result` 类型的消息来标识当前轮次的结束

#### 使用 stop_reason 判断状态（推荐）

最直接的方法是检查 `stop_reason` 字段：

```typescript
if (claudeMessage.stop_reason === 'tool_use') {
    // SDK 发送了所有工具调用，正在等待结果
    // 可以立即处理工具调用，不需要等待更多消息
}
```

#### 使用 result 消息判断状态（备用）

最可靠的方法是检查是否收到 `result` 消息：

```typescript
interface SDKResultMessage {
    type: 'result';
    subtype: 'success' | 'error';
    is_error: boolean;
    duration_ms: number;
    result: string;
    session_id: string;
    // ... 其他字段
}
```

判断逻辑：
- **收到 result 消息**：SDK 完成了当前轮次的所有处理
- **有工具调用但没有 result**：SDK 正在等待工具调用结果
- **没有工具调用且收到 result**：SDK 完成了纯文本响应

#### stop_reason 字段详解

`stop_reason` 在最后一个消息片段中会包含最终状态：

```typescript
interface ClaudeMessage {
    // ... 其他字段 ...
    stop_reason: 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use' | null;
}
```

各个值的含义：
- **`'tool_use'`** - SDK 因为需要调用工具而停止，正在等待工具结果
- **`'end_turn'`** - SDK 完成了这一轮对话
- **`'max_tokens'`** - 达到最大 token 限制
- **`'stop_sequence'`** - 遇到停止序列
- **`null`** - SDK 还在继续处理中（流式传输中的常见值）

#### 实际实现（已更新）

```typescript
// response-helper.ts 中的实现
if (message.type === 'assistant' && message.message) {
    const claudeMessage = message.message as any;
    
    // 先收集工具调用
    if (Array.isArray(claudeMessage.content)) {
        for (const block of claudeMessage.content) {
            const toolCall = this.extractToolCall(block);
            if (toolCall && onToolCall) {
                onToolCall(toolCall);
                hasToolCalls = true;
            }
        }
    }
    
    // 如果收到 stop_reason: "tool_use"，立即停止处理
    if (claudeMessage.stop_reason === 'tool_use') {
        console.log(`[ResponseHelper] 收到 stop_reason: "tool_use"，SDK 等待工具调用结果`);
        break; // 立即退出循环，不等待 result 消息
    }
}

// claude-session-manager.ts 中的实现
if (message.type === 'assistant' && message.message) {
    const claudeMessage = message.message as any;
    
    // ... 收集工具调用 ...
    
    // 如果收到 stop_reason: "tool_use"，标记会话状态
    if (claudeMessage.stop_reason === 'tool_use') {
        session.isWaitingForTool = true;
        console.log(`会话 ${sessionId} 收到 stop_reason: "tool_use"，等待工具调用结果`);
    }
}
```

#### 基于 result 消息的方法（仍然有效）

```typescript
// 判断 SDK 是否完成
function isSDKComplete(messages: SDKMessage[]): boolean {
    return messages.some(m => m.type === 'result');
}

// 判断 SDK 是否在等待工具调用（不够精确）
function isWaitingForTools(messages: SDKMessage[]): boolean {
    const hasToolCalls = messages.some(m => 
        m.type === 'assistant' && 
        m.message?.content?.some(block => block.type === 'tool_use')
    );
    const hasResult = messages.some(m => m.type === 'result');
    
    return hasToolCalls && !hasResult;
}
```

## SDK 状态判断 - 最终确认

### 核心判断逻辑

经过详细测试和日志分析，确认了判断 SDK 是否在等待工具调用的可靠方法：

**1. 主要判断方法（推荐）**
```
有工具调用 + 没有 result 消息 = SDK 在等待工具结果 ✅
有 result 消息 = SDK 已完成当前会话 ✅
```

**2. 辅助判断方法（可选）**
- 在非流式传输的最后一个消息中检查 `stop_reason: "tool_use"`
- 但由于流式传输的特性，大部分消息的 `stop_reason` 为 `null`

### 实际日志验证

从 `claude-sdk.log` 中找到的真实例子：
```json
{
  "type": "assistant",
  "message": {
    "content": [{
      "type": "tool_use",
      "name": "read_file"
    }],
    "stop_reason": "tool_use"  // 明确表示因工具调用而停止
  }
}
// 之后没有 result 消息，SDK 在等待
```

## 当前实现状态

### 已实现的功能

1. **✅ 多工具调用支持**：`convertToResponse` 方法正确合并所有工具调用
2. **✅ 消息类型识别**：支持 `SDKResultMessage` 类型
3. **✅ 完整消息缓存**：创建包含所有工具调用的单个快照
4. **✅ SDK 状态判断**：通过检测 `result` 消息准确判断 SDK 状态
5. **✅ 会话状态管理**：`isWaitingForTool` 标志正确反映会话状态

### 实现细节

#### 1. 改进的消息处理（response-processor.ts）
```typescript
// 使用 convertToResponse 来正确处理所有消息
const response = this.convertToResponse(sdkMessages, options.model);

// convertToResponse 会：
// - 合并所有 assistant 消息的文本内容
// - 收集所有工具调用到 tool_calls 数组
// - 正确处理混合响应（文本 + 工具调用）
```

#### 2. 改进的缓存机制（response-processor.ts）
```typescript
// 收集所有工具调用
const allToolCalls: any[] = [];
// ... 收集过程 ...

// 创建包含所有工具调用的单个快照
if (allToolCalls.length > 0) {
    const snapshot: ExtendedChatMessage[] = [
        ...options.messages,
        {
            role: 'assistant',
            content: null,
            tool_calls: allToolCalls,  // 所有工具调用在一个消息中
            refusal: null
        }
    ];
    this.messageTrieCache.createSnapshot(snapshot, options.sessionId);
}
```

## 限制和权衡

### SDK 行为的不确定性

Claude Code SDK 在发起工具调用后的行为：
1. **立即暂停**：SDK 发送包含工具调用的 `SDKAssistantMessage` 后立即暂停
2. **没有等待信号**：SDK 不会发送特殊消息表明正在等待工具结果
3. **无法预知数量**：无法提前知道 SDK 会发起多少个工具调用

### 当前实现的权衡

我们选择了**立即返回**策略：
- ✅ 一旦检测到任何工具调用，立即收集并返回所有工具调用
- ✅ 不会因等待而阻塞
- ✅ 符合 OpenAI API 的行为模式
- ❌ 可能错过 SDK 想要在同一轮中发送的后续内容

### 为什么这是最佳选择

1. **OpenAI API 兼容性**：OpenAI API 也是立即返回工具调用
2. **客户端期望**：客户端期望收到工具调用后立即处理
3. **避免超时**：不会因为等待不存在的消息而超时
4. **简单可靠**：减少了复杂的状态管理

## 未来改进方向

如果 Claude Code SDK 未来提供了以下功能，我们可以改进实现：

1. **明确的等待信号**：如 `waiting_for_tool_results` 消息
2. **工具调用计数**：提前告知将发起多少个工具调用
3. **批量模式**：一次性执行所有工具调用并返回结果

在此之前，当前的"立即返回"策略是最实用的方案。

## 改进方案

### 1. 增强会话状态管理

```typescript
// claude-session-manager.ts
interface RunningSession {
  sessionId: string;
  // ... 现有字段 ...
  
  // 新增：保存完整的 SDK 消息流
  completeMessages: SDKMessage[];
  
  // 新增：待处理的工具调用队列
  pendingToolCalls: {
    id: string;
    name: string;
    position: number; // 在消息流中的位置
  }[];
  
  // 新增：已处理的工具结果
  processedToolResults: Map<string, any>;
}
```

### 2. 改进消息缓存机制

```typescript
// message-trie-cache.ts
export interface MessageSnapshot {
  messages: ChatMessage[];
  sessionId: string;
  timestamp: number;
  
  // 新增：完整的 SDK 返回状态
  sdkState?: {
    completeMessages: any[];
    pendingToolCalls: string[];
    isComplete: boolean;
  };
}
```

### 3. 实现智能消息合并

```typescript
export class MessageMerger {
  /**
   * 合并客户端消息和 SDK 状态
   */
  static mergeMessages(
    clientMessages: ChatMessage[],
    sdkMessages: SDKMessage[],
    processedToolResults: Map<string, any>
  ): ChatMessage[] {
    const result: ChatMessage[] = [];
    let clientIndex = 0;
    let sdkIndex = 0;
    
    while (clientIndex < clientMessages.length || sdkIndex < sdkMessages.length) {
      const clientMsg = clientMessages[clientIndex];
      const sdkMsg = sdkMessages[sdkIndex];
      
      // 如果是工具结果，检查是否应该插入
      if (clientMsg?.role === 'tool' && clientMsg.tool_call_id) {
        // 找到对应的工具调用位置
        const toolCallPosition = this.findToolCallPosition(
          sdkMessages, 
          clientMsg.tool_call_id
        );
        
        if (toolCallPosition !== -1) {
          // 插入到正确的位置
          result.push(clientMsg);
          processedToolResults.set(clientMsg.tool_call_id, clientMsg.content);
          clientIndex++;
          continue;
        }
      }
      
      // 处理 SDK 消息
      if (sdkMsg) {
        const converted = this.convertSDKMessage(sdkMsg);
        if (converted) {
          // 如果是工具调用，检查是否已有结果
          if (this.isToolCall(converted)) {
            const toolCallId = this.extractToolCallId(converted);
            if (!processedToolResults.has(toolCallId)) {
              result.push(converted);
            }
          } else {
            result.push(converted);
          }
        }
        sdkIndex++;
      } else {
        // SDK 消息处理完，添加剩余的客户端消息
        result.push(clientMsg);
        clientIndex++;
      }
    }
    
    return result;
  }
}
```

### 4. 改进会话恢复逻辑

```typescript
// session-helper.ts
static async resolveSession(
  messages: ChatMessage[],
  messageTrieCache: MessageTrieCache,
  toolCallManager: ToolCallManager,
  claudeSessionManager: ClaudeSessionManager
): Promise<SessionContext> {
  const snapshotResult = messageTrieCache.findSessionByMessagesWithDetails(messages);
  
  if (!snapshotResult || !snapshotResult.sessionId) {
    // 新会话
    const sessionId = uuidv4();
    return { sessionId, isNewSession: true, shouldContinue: false };
  }

  const sessionId = snapshotResult.sessionId;
  const sdkState = snapshotResult.snapshot.sdkState;
  
  // 如果 SDK 已完成，返回完整结果
  if (sdkState?.isComplete) {
    return {
      sessionId,
      isNewSession: false,
      shouldContinue: false,
      completeMessages: sdkState.completeMessages
    };
  }
  
  // 分析新消息
  const analysis = this.analyzeMessages(messages, snapshotResult.matchedLength);
  
  if (analysis.hasToolResults) {
    // 更新会话状态
    const updatedState = await claudeSessionManager.updateSessionWithToolResults(
      sessionId,
      analysis.newMessages
    );
    
    // 检查是否还有待处理的工具调用
    if (updatedState.hasPendingToolCalls) {
      return {
        sessionId,
        isNewSession: false,
        shouldContinue: true,
        pendingToolCalls: updatedState.pendingToolCalls
      };
    }
  }
  
  return { sessionId, isNewSession: false, shouldContinue: false };
}
```

### 5. 支持批量工具调用

```typescript
// response-processor.ts
private async processToolCalls(
  toolCalls: ToolCall[],
  sessionId: string,
  messages: ChatMessage[]
): Promise<void> {
  // 为每个工具调用创建快照
  for (const toolCall of toolCalls) {
    const snapshot = ResponseHelper.createToolCallSnapshot(messages, toolCall);
    
    // 保存完整的 SDK 状态
    this.messageTrieCache.createSnapshotWithState(snapshot, sessionId, {
      completeMessages: this.claudeSessionManager.getPendingMessages(sessionId),
      pendingToolCalls: toolCalls.map(tc => tc.id),
      isComplete: false
    });
  }
}
```

## 实现步骤

1. **第一步**：增强 `ClaudeSessionManager` 以保存完整的 SDK 消息流
2. **第二步**：改进 `MessageTrieCache` 以支持 SDK 状态存储
3. **第三步**：实现 `MessageMerger` 工具类
4. **第四步**：更新 `SessionHelper` 的会话恢复逻辑
5. **第五步**：测试多工具调用场景

## 测试用例

### 测试1：多个工具调用
```bash
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "custom-claude-4-sonnet",
    "messages": [{
      "role": "user",
      "content": "创建三个文件：a.txt, b.txt, c.txt"
    }],
    "tools": [{
      "type": "function",
      "function": {
        "name": "create_file",
        "description": "创建文件",
        "parameters": {
          "type": "object",
          "properties": {
            "filename": {"type": "string"},
            "content": {"type": "string"}
          }
        }
      }
    }]
  }'
```

### 测试2：工具调用后继续对话
```bash
# 第一次请求
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "custom-claude-4-sonnet",
    "messages": [{
      "role": "user",
      "content": "查看当前目录的文件"
    }],
    "tools": [...]
  }'

# 返回工具调用后，客户端处理并继续
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "custom-claude-4-sonnet",
    "messages": [
      {"role": "user", "content": "查看当前目录的文件"},
      {"role": "assistant", "tool_calls": [...]},
      {"role": "tool", "tool_call_id": "...", "content": "文件列表: a.txt, b.txt"}
    ]
  }'
```

## 预期收益

1. **正确处理多工具调用**：支持 SDK 返回多个工具调用的场景
2. **保持会话状态一致**：SDK 状态和缓存状态保持同步
3. **支持复杂对话流程**：工具调用和对话可以交替进行
4. **提高系统可靠性**：避免消息丢失或错位
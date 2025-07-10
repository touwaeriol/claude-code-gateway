# 客户端断开连接处理

## 需求分析

### 1. 客户端断开连接处理
- **需求**：客户端主动断开连接时自动关闭 Claude Code SDK 会话
- **限制**：Claude Code SDK 主动返回结束时，HTTP 会话结束了，不应该结束 Claude 会话

### 2. maxTurns 参数
- **决策**：不支持 maxTurns 参数，保持严格的 OpenAI API 兼容性
- **原因**：OpenAI API 规范中没有 maxTurns 参数，这是 Claude Code SDK 特有的参数

## 实现方案

### 1. 流式响应的客户端断开检测

在 `response-processor.ts` 中监听响应流的关闭事件：

```typescript
// 检测客户端断开
let clientDisconnected = false;
res.on('close', () => {
    if (!res.writableEnded) {
        clientDisconnected = true;
        console.log(`[ResponseProcessor] 客户端断开连接 - sessionId: ${options.sessionId}`);
        // 只有在客户端主动断开时才终止会话
        this.claudeSessionManager.abortSession(options.sessionId, '客户端断开');
    }
});
```

### 2. 非流式响应的客户端断开检测

在 `index.ts` 的 `handleChatCompletion` 方法中监听请求关闭：

```typescript
// 监听客户端断开
req.on('close', () => {
    if (!res.headersSent) {
        isClientDisconnected = true;
        console.log(`[API] 客户端断开连接 - requestId: ${processedRequest?.requestId}, sessionId: ${sessionId}`);
        // 如果有会话ID，终止会话
        if (sessionId) {
            this.claudeSessionManager.abortSession(sessionId, '客户端断开');
        }
    }
});
```

### 3. 改进的会话管理

在 `claude-session-manager.ts` 中实现带原因的会话终止：

```typescript
/**
 * 终止会话（仅在客户端断开时调用）
 */
abortSession(sessionId: string, reason?: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
        console.log(`终止会话 ${sessionId} - 原因: ${reason || '未指定'}`);
        
        // 如果会话正在等待工具调用，通知工具管理器
        if (session.isWaitingForTool) {
            this.toolCallManager.cancelSessionToolCalls(sessionId);
        }
        
        // 终止 Claude Code SDK 进程
        session.abortController.abort();
        this.sessions.delete(sessionId);
    }
}
```

## 关于 OpenAI API 参数的说明

### OpenAI API 的 `n` 参数
OpenAI API 确实有 `n` 参数，但它的用途是**生成多个响应选项**，而不是控制对话轮数：
- `n`: 为每个输入消息生成多少个聊天完成选项（默认为 1）
- 例如：`n=3` 会生成 3 个不同的响应，让你可以选择最合适的

#### 示例说明
当你设置 `n=3` 时，API 会返回 3 个不同的响应：

```json
// 请求
{
  "model": "gpt-3.5-turbo",
  "messages": [{"role": "user", "content": "给我一个创意标题"}],
  "n": 3
}

// 响应
{
  "choices": [
    {
      "index": 0,
      "message": {"role": "assistant", "content": "星空下的秘密花园"}
    },
    {
      "index": 1,
      "message": {"role": "assistant", "content": "时光机器的最后一天"}
    },
    {
      "index": 2,
      "message": {"role": "assistant", "content": "被遗忘的音乐盒"}
    }
  ]
}
```

这让你可以从多个选项中选择最合适的响应，或者让用户选择他们喜欢的版本。

### 关于对话轮数控制
- OpenAI API **没有** `max_turns` 或类似参数来限制对话轮数
- 对话轮数控制通常在应用层实现，而不是 API 层
- Claude Code SDK 的 `maxTurns` 是其特有功能，不属于 OpenAI 标准

### 我们的决策
为保持严格的 OpenAI API 兼容性，我们**不支持** `maxTurns` 参数。如果需要限制对话轮数，应在客户端应用中实现。

## 测试场景

### 测试脚本
使用提供的测试脚本 `test-client-disconnect.sh` 来验证客户端断开处理：

```bash
./test-client-disconnect.sh
```

该脚本会：
1. 启动一个流式请求，然后中断它
2. 启动一个非流式请求，然后中断它
3. 验证服务器正确处理了客户端断开事件

## 注意事项

1. **会话状态保持**：SDK 主动结束时保持会话状态，支持后续的工具调用返回
2. **资源清理**：客户端断开时及时清理资源，避免内存泄漏
3. **兼容性**：支持 `maxTurns` 和 `max_turns` 两种参数格式
4. **默认行为**：不提供 maxTurns 时，SDK 使用其默认值（通常为 25）
# Claude Code SDK 参考

## 概述

Claude Code SDK 是官方提供的 TypeScript 和 Python SDK，用于程序化地调用 Claude Code。本文档基于官方文档 https://docs.anthropic.com/en/docs/claude-code/sdk。

## 安装

### TypeScript/JavaScript

```bash
npm install @anthropic-ai/claude-code
```

### Python

```bash
pip install claude-code-sdk
```

## 前提条件

- Node.js（用于 TypeScript/JavaScript）
- Python 3.10+（用于 Python）
- Claude Code CLI：`npm install -g @anthropic-ai/claude-code`

## 导入方式

### TypeScript

```typescript
import { query, type SDKMessage } from "@anthropic-ai/claude-code";
```

### Python

```python
from claude_code_sdk import query, ClaudeCodeOptions, Message
```

## query 函数详解

### 基本签名

```typescript
query({
  prompt: string,
  abortController?: AbortController,
  options?: {
    maxTurns?: number,
    systemPrompt?: string,
    allowedTools?: string[],
    disallowedTools?: string[],
    permissionMode?: string,
    dangerouslySkipPermissions?: boolean
  }
})
```

### 参数说明

#### prompt (必需)
- 类型：`string`
- 描述：发送给 Claude 的提示文本

#### abortController (可选)
- 类型：`AbortController`
- 描述：用于取消正在进行的查询

#### options (可选)

##### maxTurns
- 类型：`number`
- 默认值：未指定
- 描述：限制 Claude 的代理轮次数量

##### systemPrompt
- 类型：`string`
- 描述：自定义系统提示，用于指导 Claude 的行为

##### allowedTools
- 类型：`string[]`
- 描述：明确允许使用的工具列表
- 示例：`["Read", "Write", "mcp__gateway__search"]`

##### disallowedTools
- 类型：`string[]`
- 描述：明确禁止使用的工具列表
- 示例：`["Bash", "Edit", "Write"]`
- 注意：不支持通配符 `*`

##### permissionMode
- 类型：`string`
- 描述：控制编辑和工具使用权限的模式

##### dangerouslySkipPermissions
- 类型：`boolean`
- 默认值：`false`
- 描述：跳过权限提示（谨慎使用）

## 认证方式

### 1. Anthropic API Key

```bash
# 设置环境变量
export ANTHROPIC_API_KEY="your-api-key"
```

### 2. Amazon Bedrock

```bash
export CLAUDE_CODE_USE_BEDROCK=1
```

### 3. Google Vertex AI

```bash
export CLAUDE_CODE_USE_VERTEX=1
```

## 使用示例

### TypeScript 完整示例

```typescript
import { query, type SDKMessage } from "@anthropic-ai/claude-code";

async function callClaude() {
  const messages: SDKMessage[] = [];
  
  try {
    for await (const message of query({
      prompt: "分析 src 目录下的代码结构",
      options: {
        maxTurns: 3,
        allowedTools: ["Read", "Grep", "Glob"],
        disallowedTools: ["Bash", "Write", "Edit"],
        systemPrompt: "你是一个代码分析助手，只能读取文件，不能修改。"
      }
    })) {
      messages.push(message);
      console.log("收到消息:", message);
      
      // 处理不同类型的消息
      if (message.type === 'text') {
        console.log("文本内容:", message.content);
      } else if (message.type === 'tool_use') {
        console.log("工具调用:", message.name, message.arguments);
      }
    }
  } catch (error) {
    console.error("查询失败:", error);
  }
  
  return messages;
}
```

### Python 完整示例

```python
from claude_code_sdk import query, ClaudeCodeOptions, Message
import asyncio

async def call_claude():
    messages = []
    
    try:
        async for message in query(
            prompt="分析 src 目录下的代码结构",
            options=ClaudeCodeOptions(
                max_turns=3,
                allowed_tools=["Read", "Grep", "Glob"],
                disallowed_tools=["Bash", "Write", "Edit"],
                system_prompt="你是一个代码分析助手，只能读取文件，不能修改。"
            )
        ):
            messages.append(message)
            print(f"收到消息: {message}")
            
            # 处理不同类型的消息
            if message.type == 'text':
                print(f"文本内容: {message.content}")
            elif message.type == 'tool_use':
                print(f"工具调用: {message.name} {message.arguments}")
    
    except Exception as error:
        print(f"查询失败: {error}")
    
    return messages

# 运行异步函数
asyncio.run(call_claude())
```

## 消息类型

### SDKMessage 结构

```typescript
interface SDKMessage {
  type: 'text' | 'tool_use' | 'tool_result' | 'error';
  content?: string;
  name?: string;
  arguments?: any;
  tool_use_id?: string;
  error?: string;
}
```

### 消息类型说明

1. **text**: 普通文本响应
   - `content`: 文本内容

2. **tool_use**: 工具调用请求
   - `name`: 工具名称
   - `arguments`: 工具参数
   - `tool_use_id`: 工具调用 ID

3. **tool_result**: 工具执行结果
   - `tool_use_id`: 对应的工具调用 ID
   - `content`: 结果内容

4. **error**: 错误消息
   - `error`: 错误描述

## 工具控制最佳实践

### 1. 最小权限原则

```typescript
// 只允许必要的工具
const options = {
  allowedTools: ["mcp__gateway__search", "mcp__gateway__get_data"],
  disallowedTools: ["Bash", "Edit", "Write", "Delete"]
};
```

### 2. 明确列出所有内置工具

由于不支持通配符，需要明确列出要禁用的内置工具：

```typescript
const CLAUDE_BUILTIN_TOOLS = [
  "Bash",
  "Edit",
  "Write",
  "Read",
  "Search",
  "Grep",
  "Glob",
  "TodoRead",
  "TodoWrite",
  "NotebookRead",
  "NotebookEdit",
  "WebFetch",
  "WebSearch"
];

// 禁用所有内置工具
const options = {
  disallowedTools: CLAUDE_BUILTIN_TOOLS,
  allowedTools: ["mcp__gateway__custom_tool"]
};
```

### 3. 使用 Session ID 跟踪

```typescript
function buildPromptWithSession(prompt: string, sessionId: string): string {
  return `[SESSION: ${sessionId}]\n${prompt}`;
}

const result = await query({
  prompt: buildPromptWithSession("用户的问题", "session-123"),
  options: {
    // ... 其他选项
  }
});
```

## 错误处理

### TypeScript

```typescript
try {
  for await (const message of query({ prompt: "..." })) {
    // 处理消息
  }
} catch (error) {
  if (error.code === 'PERMISSION_DENIED') {
    console.error("权限被拒绝");
  } else if (error.code === 'TOOL_NOT_FOUND') {
    console.error("工具未找到");
  } else {
    console.error("未知错误:", error);
  }
}
```

### Python

```python
try:
    async for message in query(prompt="..."):
        # 处理消息
        pass
except PermissionError as e:
    print("权限被拒绝")
except ToolNotFoundError as e:
    print("工具未找到")
except Exception as e:
    print(f"未知错误: {e}")
```

## 高级用法

### 1. 中断查询

```typescript
const controller = new AbortController();

// 在另一个地方可以中断查询
setTimeout(() => controller.abort(), 30000); // 30秒超时

try {
  for await (const message of query({
    prompt: "长时间运行的任务",
    abortController: controller
  })) {
    // 处理消息
  }
} catch (error) {
  if (error.name === 'AbortError') {
    console.log("查询被中断");
  }
}
```

### 2. 自定义权限提示工具

```typescript
const result = await query({
  prompt: "需要权限控制的操作",
  options: {
    permissionMode: "custom",
    allowedTools: ["permission_control_mcp"]
  }
});
```

## 与 API 服务集成

在 Claude Code Gateway 项目中使用 SDK：

```typescript
import { query } from "@anthropic-ai/claude-code";

class ClaudeCodeService {
  async processOpenAIRequest(
    messages: OpenAIMessage[],
    tools: OpenAITool[],
    sessionId: string
  ) {
    // 1. 转换 OpenAI 工具为允许列表
    const allowedTools = tools.map(t => `mcp__gateway__${t.function.name}`);
    
    // 2. 构建 Claude 提示
    const prompt = this.buildClaudePrompt(messages, sessionId);
    
    // 3. 调用 Claude Code SDK
    const claudeMessages = [];
    for await (const message of query({
      prompt,
      options: {
        maxTurns: 1,
        allowedTools,
        disallowedTools: CLAUDE_BUILTIN_TOOLS,
        dangerouslySkipPermissions: true
      }
    })) {
      claudeMessages.push(message);
    }
    
    // 4. 转换回 OpenAI 格式
    return this.convertToOpenAIResponse(claudeMessages);
  }
}
```

## 注意事项

1. **工具名称格式**：MCP 工具名称格式为 `mcp__<server>__<tool>`
2. **权限控制**：在生产环境中谨慎使用 `dangerouslySkipPermissions`
3. **错误处理**：始终包含适当的错误处理逻辑
4. **资源清理**：使用 AbortController 来清理长时间运行的查询
5. **日志记录**：记录所有工具调用以便审计

## 相关链接

- [官方 SDK 文档](https://docs.anthropic.com/en/docs/claude-code/sdk)
- [MCP 协议文档](https://docs.anthropic.com/en/docs/claude-code/mcp)
- [Claude Code CLI 文档](https://docs.anthropic.com/en/docs/claude-code/cli-reference)
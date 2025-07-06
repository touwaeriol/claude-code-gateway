# Claude Code Gateway 示例集合

这个目录包含了使用 Claude Code Gateway 的核心示例代码，展示如何通过 OpenAI 兼容 API 使用 Claude 的工具调用功能。

## 📁 核心示例

### 1. **quick-demo.mjs** - 快速入门
最简单的示例，快速了解工具调用流程。

```bash
node examples/quick-demo.mjs
```

### 2. **tool-usage.mjs** - 完整工具使用
展示工具调用的完整流程：发送请求 → 获取工具调用 → 执行工具 → 返回结果。

```bash
node examples/tool-usage.mjs
```

### 3. **multi-tool-example.mjs** - 多工具协作
演示如何在一次对话中使用多个工具完成复杂任务。

```bash
node examples/multi-tool-example.mjs
```

### 4. **interactive-client.mjs** - 交互式客户端
模拟真实的 OpenAI 客户端，自动处理工具调用，支持连续对话。

```bash
node examples/interactive-client.mjs
```

特性：
- 自动执行工具调用
- 支持多轮对话
- 模拟真实的工具执行
- 友好的命令行界面

### 5. **python-client.py** - Python 集成
使用 OpenAI Python SDK 的完整示例。

```bash
pip install openai
python examples/python-client.py
```

## 🛠️ 可用工具

### 1. 计算器 (calculate)
```javascript
{
  name: "mcp__gateway__calculate",
  parameters: {
    expression: "数学表达式"
  }
}
```

### 2. 搜索 (search)
```javascript
{
  name: "mcp__gateway__search",
  parameters: {
    query: "搜索查询",
    limit: 5  // 可选
  }
}
```

### 3. 天气查询 (get_weather)
```javascript
{
  name: "mcp__gateway__get_weather",
  parameters: {
    location: "城市名",
    units: "celsius"  // 或 "fahrenheit"
  }
}
```

## 🔄 工具调用流程

1. **客户端发送请求**
   ```javascript
   {
     messages: [{ role: "user", content: "..." }],
     tools: [/* 工具定义 */]
   }
   ```

2. **AI 返回工具调用**
   ```javascript
   {
     tool_calls: [{
       id: "call_xxx",
       function: { name: "calculate", arguments: "{...}" }
     }]
   }
   ```

3. **客户端执行工具**
   ```javascript
   // 执行工具并获取结果
   const result = executeToolFunction(args);
   ```

4. **发送结果继续对话**
   ```javascript
   messages.push({
     role: "tool",
     content: JSON.stringify(result),
     tool_call_id: "call_xxx"
   });
   ```

## 💡 使用提示

1. **工具名称前缀**：所有工具名称必须以 `mcp__gateway__` 开头
2. **自动权限控制**：只有客户端提供的工具才能使用
3. **会话隔离**：每个请求的工具权限独立
4. **工具执行**：客户端负责执行工具，Gateway 只返回调用信息

## 🚀 快速开始

1. 确保 Gateway 正在运行：
   ```bash
   npm run dev
   ```

2. 运行任意示例：
   ```bash
   node examples/interactive-client.mjs
   ```

3. 或使用 Python：
   ```python
   from openai import OpenAI
   
   client = OpenAI(
       base_url="http://localhost:3000/v1",
       api_key="any-key"
   )
   
   response = client.chat.completions.create(
       model="custom-claude-4-sonnet",
       messages=[{"role": "user", "content": "计算 2+2"}],
       tools=[/* 工具定义 */]
   )
   ```

## 📊 测试所有功能

运行完整测试套件：
```bash
# 测试基本功能
./test-gateway.sh

# 测试工具调用
node examples/auto-test-tools.mjs

# 交互式测试
node examples/interactive-client.mjs
```

## 🔍 调试技巧

1. 查看详细日志：
   ```bash
   tail -f logs/app.log
   ```

2. 监控 MCP 通信：
   ```bash
   tail -f logs/error.log | grep MCP
   ```

3. 测试单个工具：
   ```bash
   curl -X POST http://localhost:3000/mcp/gateway/calculate \
     -H "X-Session-ID: test-session" \
     -d '{"expression": "1+1"}'
   ```
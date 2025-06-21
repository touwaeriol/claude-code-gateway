# Claude OpenAI Proxy

一个兼容 OpenAI API 规范的代理服务，通过复用 Claude Code CLI 的认证机制访问 Claude 模型。

## 功能特性

- ✅ 完全兼容 OpenAI API 格式
- ✅ 支持 `custom-claude-4-opus` 和 `custom-claude-4-sonnet` 模型
- ✅ 自动使用 CLI 已有的认证（OAuth 或 API Key）
- ✅ 支持流式和非流式响应
- ✅ 支持工具调用（Function Calling）
- ✅ 完整的错误处理和日志记录
- ✅ 健康检查端点

## 前置要求

1. Node.js >= 16.0.0
2. 已安装 Claude Code CLI 并完成登录

## 安装

```bash
# 克隆仓库
git clone <repository-url>
cd claude-code-proxy

# 安装依赖
npm install
```

## 配置

1. 复制环境变量配置文件：
```bash
cp .env.example .env
```

2. 根据需要修改 `.env` 文件中的配置

## 启动服务

```bash
# 生产模式
npm start

# 开发模式（自动重启）
npm run dev
```

## 使用方法

### 使用 curl 测试

```bash
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer any-value" \
  -d '{
    "model": "custom-claude-4-sonnet",
    "messages": [{"role": "user", "content": "你好！"}],
    "max_tokens": 1000
  }'
```

### 使用 Python SDK

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:3000/v1",
    api_key="any-value"  # 代理服务使用CLI认证，此处可填任意值
)

response = client.chat.completions.create(
    model="custom-claude-4-sonnet",
    messages=[{"role": "user", "content": "写一首关于春天的诗"}]
)

print(response.choices[0].message.content)
```

### 使用 Node.js SDK

```javascript
import OpenAI from 'openai';

const openai = new OpenAI({
  baseURL: 'http://localhost:3000/v1',
  apiKey: 'any-value'
});

const response = await openai.chat.completions.create({
  model: 'custom-claude-4-opus',
  messages: [{ role: 'user', content: '解释一下量子计算' }]
});

console.log(response.choices[0].message.content);
```

### 流式响应

```python
stream = client.chat.completions.create(
    model="custom-claude-4-sonnet",
    messages=[{"role": "user", "content": "讲一个长故事"}],
    stream=True
)

for chunk in stream:
    if chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end='')
```

### 工具调用（Function Calling）

```python
# 定义工具
tools = [{
    "type": "function",
    "function": {
        "name": "get_weather",
        "description": "获取指定城市的天气",
        "parameters": {
            "type": "object",
            "properties": {
                "location": {
                    "type": "string",
                    "description": "城市名称"
                }
            },
            "required": ["location"]
        }
    }
}]

# 发送带工具的请求
response = client.chat.completions.create(
    model="custom-claude-4-opus",
    messages=[{"role": "user", "content": "北京今天天气怎么样？"}],
    tools=tools,
    tool_choice="auto"
)

# 处理工具调用
if response.choices[0].message.tool_calls:
    for tool_call in response.choices[0].message.tool_calls:
        print(f"调用函数: {tool_call.function.name}")
        print(f"参数: {tool_call.function.arguments}")
```

## API 端点

### Chat Completions
- **端点**: `POST /v1/chat/completions`
- **功能**: 创建对话完成

### Models
- **端点**: `GET /v1/models`
- **功能**: 列出可用模型

### Health Check
- **端点**: `GET /health`
- **功能**: 检查服务健康状态

## 支持的模型

| OpenAI 模型名 | Claude 模型 | 说明 |
|--------------|------------|------|
| custom-claude-4-opus | Claude Opus 4 | 适合复杂任务 |
| custom-claude-4-sonnet | Claude Sonnet 4 | 适合日常使用 |

## 常见问题

### 1. 启动时提示未找到认证信息

确保已通过 Claude CLI 完成登录：
```bash
claude auth login
```

### 2. 模型访问权限问题

某些模型（如 Opus）需要特定的订阅类型才能访问。请检查你的 Claude 账户订阅状态。

### 3. 请求超时

可以通过环境变量 `CLAUDE_API_TIMEOUT` 调整超时时间（默认 60 秒）。

## 开发

### 项目结构

```
src/
├── app.js              # Express 应用配置
├── index.js            # 服务入口
├── config/             # 配置管理
├── auth/               # CLI 认证检测
├── claude/             # Claude API 客户端
├── converters/         # 格式转换器
├── routes/             # API 路由
├── middleware/         # 中间件
└── utils/              # 工具函数
```

### 运行测试

```bash
npm test
```

## 许可证

MIT License
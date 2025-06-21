# Claude OpenAI 兼容代理服务需求文档

## 1. 项目概述

### 1.1 项目背景
开发一个兼容 OpenAI API 规范的代理服务，通过复用 Claude Code CLI 的认证机制和 API 调用逻辑，让用户能够使用 OpenAI SDK 或其他兼容工具调用 Claude 模型。

### 1.2 核心价值
- **无缝集成**: 使用现有的 OpenAI SDK 即可调用 Claude 模型
- **认证复用**: 直接使用 Claude Code CLI 已完成的登录认证
- **模型映射**: 支持 `custom-claude-4-opus` 和 `custom-claude-4-sonnet` 两个模型

### 1.3 技术架构
```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  OpenAI SDK/    │────▶│  代理服务         │────▶│  Claude API     │
│  其他客户端      │     │  (本项目)        │     │                 │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                               │                           ▲
                               ▼                           │
                        ┌──────────────────┐              │
                        │ Claude Code CLI  │──────────────┘
                        │ 认证信息         │
                        └──────────────────┘
```

## 2. 业务逻辑详细说明

### 2.1 服务启动流程

#### 2.1.1 认证检测逻辑
服务启动时，需要检测用户是否已通过 CLI 完成登录：

1. **检查 OAuth 认证**
   - 读取 CLI 配置文件（路径根据操作系统而定）
   - 检查是否存在 `oauthAccount.accessToken`
   - 验证 token 是否在有效期内

2. **检查 API Key 认证**
   - 如果没有 OAuth 认证，检查是否存在存储的 API Key
   - macOS: 从 Keychain 读取（服务名: "Claude Code"）
   - 其他系统: 从 `.credentials.json` 文件读取

3. **认证失败处理**
   - 如果未找到任何认证信息，提示用户先运行 `claude auth login`
   - 显示清晰的错误信息和操作指引

#### 2.1.2 配置路径检测
```javascript
// CLI 配置目录路径
macOS: ~/.claude-code/
Windows: ~/AppData/Roaming/claude-code/
Linux: ~/.claude-code/

// 凭据存储位置
macOS Keychain: 服务名 "Claude Code"
文件系统: {配置目录}/.credentials.json
```

### 2.2 请求转发逻辑

#### 2.2.1 模型映射
```javascript
const MODEL_MAPPING = {
  'custom-claude-4-opus': 'claude-opus-4-20250514',
  'custom-claude-4-sonnet': 'claude-sonnet-4-20250514'
};
```

#### 2.2.2 请求格式转换
OpenAI 格式请求需要转换为 Claude API 格式：

```javascript
// OpenAI 请求格式
{
  "model": "custom-claude-4-opus",
  "messages": [
    {"role": "system", "content": "You are a helpful assistant"},
    {"role": "user", "content": "Hello"}
  ],
  "max_tokens": 1000,
  "temperature": 0.7,
  "stream": false
}

// 转换为 Claude 格式
{
  "model": "claude-opus-4-20250514",
  "messages": [
    {"role": "user", "content": "You are a helpful assistant\n\nHuman: Hello\n\nAssistant:"}
  ],
  "max_tokens": 1000,
  "temperature": 0.7,
  "stream": false
}
```

#### 2.2.3 认证头处理
根据 CLI 认证类型添加相应的认证头：

- **OAuth 认证**: `Authorization: Bearer {access_token}`
- **API Key 认证**: `x-api-key: {api_key}`

### 2.3 Token 管理逻辑

#### 2.3.1 Token 有效性检查
- 检查 `expiresAt` 字段判断 token 是否过期
- 如果即将过期（< 5分钟），主动刷新

#### 2.3.2 Token 刷新流程
1. 使用 refresh_token 调用 Claude OAuth API
2. 获取新的 access_token 和 expires_at
3. 更新 CLI 配置文件中的认证信息
4. 继续处理原始请求

### 2.4 响应处理逻辑

#### 2.4.1 非流式响应
Claude API 响应需要转换为 OpenAI 格式：

```javascript
// Claude 响应
{
  "id": "msg_xxx",
  "type": "message",
  "role": "assistant",
  "content": [{"type": "text", "text": "Hello! How can I help?"}],
  "model": "claude-opus-4-20250514",
  "stop_reason": "end_turn",
  "usage": {"input_tokens": 10, "output_tokens": 20}
}

// 转换为 OpenAI 格式
{
  "id": "chatcmpl-xxx",
  "object": "chat.completion",
  "created": 1234567890,
  "model": "custom-claude-4-opus",
  "choices": [{
    "index": 0,
    "message": {
      "role": "assistant",
      "content": "Hello! How can I help?"
    },
    "finish_reason": "stop"
  }],
  "usage": {
    "prompt_tokens": 10,
    "completion_tokens": 20,
    "total_tokens": 30
  }
}
```

#### 2.4.2 流式响应（SSE）
处理 Server-Sent Events 流式响应：

1. Claude 流式事件转换为 OpenAI 流式格式
2. 保持连接活跃，实时转发数据
3. 正确处理结束标记

### 2.5 错误处理逻辑

#### 2.5.1 认证错误
- CLI 认证失效 → 返回 401 错误
- 提示用户重新登录 CLI

#### 2.5.2 模型访问错误
- 用户无权访问特定模型 → 返回 403 错误
- 建议用户检查订阅类型

#### 2.5.3 请求格式错误
- 参数验证失败 → 返回 400 错误
- 提供清晰的错误描述

## 3. API 端点规范

### 3.1 Chat Completions
```
POST /v1/chat/completions
```

**请求示例**:
```bash
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer any-value" \
  -d '{
    "model": "custom-claude-4-sonnet",
    "messages": [{"role": "user", "content": "Hello"}],
    "max_tokens": 1000
  }'
```

### 3.2 Models 列表
```
GET /v1/models
```

**响应示例**:
```json
{
  "object": "list",
  "data": [
    {
      "id": "custom-claude-4-opus",
      "object": "model",
      "created": 1677610602,
      "owned_by": "anthropic"
    },
    {
      "id": "custom-claude-4-sonnet",
      "object": "model",
      "created": 1677610602,
      "owned_by": "anthropic"
    }
  ]
}
```

### 3.3 健康检查
```
GET /health
```

**响应示例**:
```json
{
  "status": "healthy",
  "cli_authenticated": true,
  "auth_method": "oauth",
  "available_models": ["custom-claude-4-opus", "custom-claude-4-sonnet"]
}
```

## 4. 使用示例

### 4.1 Python SDK 使用
```python
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:3000/v1",
    api_key="any-value"  # 代理服务使用CLI认证，此处可填任意值
)

response = client.chat.completions.create(
    model="custom-claude-4-sonnet",
    messages=[{"role": "user", "content": "你好"}]
)

print(response.choices[0].message.content)
```

### 4.2 Node.js SDK 使用
```javascript
import OpenAI from 'openai';

const openai = new OpenAI({
  baseURL: 'http://localhost:3000/v1',
  apiKey: 'any-value'
});

const response = await openai.chat.completions.create({
  model: 'custom-claude-4-opus',
  messages: [{ role: 'user', content: '请写一首诗' }]
});

console.log(response.choices[0].message.content);
```

### 4.3 流式响应使用
```python
stream = client.chat.completions.create(
    model="custom-claude-4-sonnet",
    messages=[{"role": "user", "content": "讲个故事"}],
    stream=True
)

for chunk in stream:
    if chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end='')
```

## 5. 部署与配置

### 5.1 环境要求
- Node.js >= 16
- Claude Code CLI 已安装并完成登录
- 端口 3000（可配置）

### 5.2 安装步骤
```bash
# 1. 克隆项目
git clone <repository>
cd claude-openai-proxy

# 2. 安装依赖
npm install

# 3. 配置环境变量（可选）
cp .env.example .env
# 编辑 .env 文件设置端口等配置

# 4. 启动服务
npm start
```

### 5.3 配置选项
```javascript
{
  "server": {
    "port": 3000,              // 服务端口
    "host": "localhost"        // 服务地址
  },
  "claude": {
    "timeout": 60000,          // 请求超时时间（毫秒）
    "maxRetries": 3            // 最大重试次数
  },
  "logging": {
    "level": "info"            // 日志级别
  }
}
```

## 6. 注意事项

1. **认证依赖**: 本服务完全依赖 Claude Code CLI 的认证状态，不独立管理用户凭据

2. **模型访问**: 用户需要有相应的订阅才能访问 Opus 模型

3. **并发限制**: 受 Claude API 的速率限制约束

4. **错误处理**: 所有错误都会转换为 OpenAI 兼容的错误格式

5. **安全考虑**: 
   - 建议只在本地或内网环境使用
   - 如需公网访问，请添加额外的认证层

## 7. 开发路线图

### Phase 1 - 基础功能（MVP）
- [x] CLI 认证检测
- [x] 基础请求转发
- [x] 模型映射
- [x] 错误处理

### Phase 2 - 完善功能
- [ ] 流式响应支持
- [ ] Token 自动刷新
- [ ] 请求日志记录
- [ ] 性能优化

### Phase 3 - 高级功能
- [ ] 多用户支持
- [ ] 请求缓存
- [ ] 监控面板
- [ ] Docker 镜像
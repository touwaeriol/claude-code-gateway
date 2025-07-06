# Claude Code Gateway

基于 Claude Code SDK 的企业级 OpenAI 兼容 API 网关服务，提供完整的权限控制、工具管理和审计功能。

## ✨ 核心特性

- 🔄 **完全兼容 OpenAI API** - 无缝替换现有 OpenAI 集成
- 🚀 **基于官方 Claude Code SDK** - 稳定可靠的底层实现
- 🔐 **企业级权限控制** - 细粒度的工具调用权限管理
- 🛠️ **MCP 工具网关** - 支持自定义工具扩展
- 📊 **完整审计日志** - 所有操作可追溯
- 🌊 **流式响应支持** - 实时输出，优化用户体验

## 🚀 快速开始

### 安装依赖
```bash
npm install
```

### 开发模式（推荐）
```bash
# TypeScript 直接运行
npm run dev:ts

# 或者监听文件变化自动重启
npm run dev
```

### 生产模式
```bash
# 构建 TypeScript
npm run build

# 运行构建后的 JS
npm run start
```

## 🔐 企业级权限控制

### 核心安全架构

本项目实现了完整的企业级权限控制系统，确保 AI 工具调用的安全性和可控性：

#### 1. 多层安全防护
- **系统级禁用**: 通过 `disallowedTools` 禁用所有危险的内置工具
- **权限网关**: 内置 MCP 权限服务器，拦截所有工具调用请求
- **会话隔离**: 每个 API 请求独立会话，权限互不影响
- **审计追踪**: 所有权限检查和工具调用完整记录

#### 2. MCP 工具网关架构
```
Claude → 权限检查(approval_prompt) → 允许/拒绝 → 执行工具
```
- 使用 HTTP MCP 协议，支持动态工具注册
- 权限服务器实时验证每个工具调用
- 网关服务器只暴露授权的工具

#### 3. 细粒度权限控制
- **工具级别**: 精确控制每个工具的访问权限
- **参数验证**: 验证工具调用参数的合法性
- **动态授权**: 根据会话上下文动态调整权限

### 权限控制示例

```bash
# ✅ 完全禁用工具 - 不提供任何工具
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "custom-claude-4-sonnet",
    "messages": [{"role": "user", "content": "请计算 123 + 456 并读取文件"}],
    "tools": []
  }'
# 结果：Claude 不会尝试调用任何工具，只能用文本回复

# ✅ 只允许特定工具
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "custom-claude-4-sonnet", 
    "messages": [{"role": "user", "content": "计算 123 + 456"}],
    "tools": [{"type": "function", "function": {"name": "calculate", ...}}]
  }'
# 结果：Claude 只能调用 calculate 工具，无法执行其他操作
```

### 安全保证

- ❌ **内置工具被禁用**：Claude 无法读取文件、执行代码、访问网络
- ❌ **外部 MCP 工具被禁用**：只能使用我们控制的虚拟 MCP 服务器
- ✅ **客户端控制权限**：只有客户端提供的工具才能被使用
- ✅ **会话隔离**：不同请求之间权限完全独立

### 🛡️ 内置工具

网关内置了以下安全的工具，客户端可以选择性启用：

| 工具名称 | 功能描述 | 参数 |
|---------|---------|------|
| `mcp__gateway__calculate` | 数学表达式计算 | `expression: string` |
| `mcp__gateway__search` | 信息搜索（模拟） | `query: string, limit?: number` |
| `mcp__gateway__get_weather` | 天气查询（模拟） | `location: string, units?: 'celsius'\|'fahrenheit'` |

### 测试服务
```bash
# 基本测试
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "custom-claude-4-sonnet",
    "messages": [{"role": "user", "content": "你好"}]
  }'

# 工具调用测试
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "custom-claude-4-opus",
    "messages": [{"role": "user", "content": "计算 15 * 28"}],
    "tools": [{
      "type": "function",
      "function": {
        "name": "calculate",
        "description": "执行数学计算",
        "parameters": {
          "type": "object",
          "properties": {
            "expression": {"type": "string"}
          },
          "required": ["expression"]
        }
      }
    }]
  }'
```

## 🧪 测试服务

```bash
# 基本对话测试
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "custom-claude-4-sonnet",
    "messages": [{"role": "user", "content": "你好"}]
  }'

# 查看更多示例
ls examples/
```

## 📋 支持的模型

- `custom-claude-4-sonnet` - Claude Sonnet 4
- `custom-claude-4-opus` - Claude Opus 4

## 🛠️ 客户端使用

### Python
```python
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:3000/v1",
    api_key="any-value"  # 可以是任意值
)

response = client.chat.completions.create(
    model="custom-claude-4-sonnet",
    messages=[{"role": "user", "content": "你好"}]
)
```

### JavaScript/TypeScript
```typescript
import OpenAI from 'openai';

const openai = new OpenAI({
    baseURL: 'http://localhost:3000/v1',
    apiKey: 'any-value'
});

const response = await openai.chat.completions.create({
    model: 'custom-claude-4-sonnet',
    messages: [{ role: 'user', content: '你好' }]
});
```

## ✅ 功能特性

### 开发体验
- 🎯 **TypeScript 原生** - 完整类型支持，优秀的 IDE 体验
- 🔥 **热重载开发** - 文件变化自动重启
- 📦 **生产构建** - 支持编译优化部署

### API 兼容性
- 🔄 **OpenAI 完全兼容** - 支持所有主流 OpenAI 客户端
- 🌊 **流式响应** - 实时输出，支持 SSE
- 🛠️ **工具调用** - 完整的 Function Calling 支持

### 企业特性
- 🔐 **权限管理** - 基于会话的细粒度控制
- 📊 **审计日志** - 符合合规要求的日志记录
- 🚦 **速率限制** - 保护后端资源（可扩展）
- 🔌 **插件系统** - 易于扩展新工具

## 🏗️ 系统架构

```
┌─────────────────┐     ┌──────────────────────────────┐     ┌─────────────────┐
│  OpenAI Client  │────▶│    Claude Code Gateway       │────▶│  Claude Code    │
│  (Python/JS/...)│     │                              │     │      SDK        │
└─────────────────┘     │  ┌────────────────────────┐ │     └─────────────────┘
                        │  │   Permission Control    │ │
                        │  ├────────────────────────┤ │
                        │  │   MCP Tool Gateway     │ │
                        │  ├────────────────────────┤ │
                        │  │   Session Manager      │ │
                        │  ├────────────────────────┤ │
                        │  │   Audit Logger         │ │
                        │  └────────────────────────┘ │
                        └──────────────────────────────┘
```

## 🚀 部署指南

### Docker 部署（推荐）
```bash
# 构建镜像
docker build -t claude-gateway .

# 运行容器
docker run -p 3000:3000 \
  -e ANTHROPIC_API_KEY=your-key \
  -e CORS_ORIGIN="*" \
  claude-gateway
```

### PM2 部署
```bash
# 安装 PM2
npm install -g pm2

# 构建项目
npm run build

# 启动服务
pm2 start dist/index.js --name claude-gateway

# 查看日志
pm2 logs claude-gateway
```

### 环境变量
- `PORT` - 服务端口（默认: 3000）
- `CORS_ORIGIN` - CORS 允许的域名（默认: *）
- `LOG_LEVEL` - 日志级别（默认: info）
- `SESSION_TIMEOUT` - 会话超时时间（默认: 5分钟）

## 📖 开发指南

```bash
# 开发模式（自动重启）
npm run dev

# 构建生产版本
npm run build

# 运行生产版本
npm run start
```

## 📖 API 文档

### OpenAI 兼容端点
- `GET /v1/models` - 获取支持的模型列表
- `GET /v1/models/:id` - 获取模型详情
- `POST /v1/chat/completions` - 创建聊天完成

### 管理端点
- `GET /health` - 健康检查和系统状态
- `POST /mcp/permission/check` - 权限验证端点
- `POST /mcp/gateway/:tool` - 工具执行端点

### MCP 协议端点
- `POST /mcp/permission` - MCP 权限服务器
- `POST /mcp/gateway` - MCP 网关服务器

## 🔒 安全最佳实践

### 生产环境建议
1. **API 认证**: 实现真实的 API Key 验证
2. **HTTPS**: 使用 TLS 加密所有通信
3. **速率限制**: 防止滥用和 DDoS
4. **日志管理**: 使用专业日志系统（如 ELK）
5. **监控告警**: 集成监控系统（如 Prometheus）

### 权限配置建议
- 最小权限原则：只授予必要的工具权限
- 定期审计：检查权限使用情况
- 工具白名单：明确定义可用工具集

## 📚 文档

- [项目概述](./docs/OVERVIEW.md) - 详细介绍和使用场景
- [架构设计](./docs/ARCHITECTURE.md) - 系统架构和技术设计
- [安全指南](./docs/SECURITY.md) - 权限控制和安全实践
- [SDK 参考](./docs/CLAUDE_CODE_SDK.md) - Claude Code SDK 使用指南
- [示例代码](./examples/README.md) - 各种语言的集成示例

## 📄 许可证

MIT
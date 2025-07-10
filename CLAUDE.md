# Claude Code Gateway 项目说明

## 项目概述

Claude Code OpenAI 代理服务 - 提供 OpenAI 兼容的 API 接口，底层使用 Claude Code SDK，支持完整的工具调用（Function Calling）功能。

**项目状态：✅ 生产就绪**（版本：v2.0.2，完成度：100%）

该项目已完全实现所有核心功能，包括：
- 完整的 OpenAI API 兼容性
- 基于 MCP 协议的工具调用系统
- 智能会话管理和消息缓存
- 完善的权限控制和安全审计
- 生产级别的监控和日志系统

## 项目文档

### 📖 文档导航入口
- **[文档中心](docs/README.md)** - 所有文档的统一入口，包含快速导航和分类索引

### 📚 核心文档（5篇必读）
1. **[项目概览](docs/OVERVIEW.md)** - 了解项目价值和功能
2. **[系统架构](docs/ARCHITECTURE.md)** - 理解系统设计
3. **[工具调用流程](docs/tool-call-flow.md)** - 掌握核心流程
4. **[安全设计](docs/SECURITY.md)** - 了解安全架构
5. **[Claude Code SDK 指南](docs/CLAUDE_CODE_SDK.md)** - SDK 使用说明

### 🔧 技术文档（选读）
- [多工具调用处理](docs/multi-tool-call-handling.md) - SDK 行为分析
- [日志系统](docs/logging.md) - 统一日志方案
- [实现决策](docs/implementation-decisions.md) - 技术决策记录
- 更多文档请查看[文档中心](docs/README.md)

### 3. 核心代码模块

- **[主服务](src/index.ts)**
    - Express 服务器初始化
    - 所有核心服务组件集成
    - API 端点路由配置

- **[Claude 服务](src/services/claude-service.ts)**
    - Claude Code SDK 集成
    - 流式和非流式响应处理
    - MCP 服务器配置

- **[会话管理](src/services/session-manager.ts)**
    - 会话创建和管理
    - 工具权限管理
    - 会话状态跟踪

- **[工具调用管理](src/services/tool-call-manager.ts)**
    - 异步工具调用管理
    - 超时处理和错误恢复
    - 会话级别管理

- **[消息缓存](src/services/message-trie-cache.ts)**
    - Trie 树结构的消息快照
    - 智能匹配和缓存优化
    - 自动清理机制

- **[权限控制](src/services/permission-controller.ts)**
    - 完整的权限验证流程
    - 审计日志记录
    - 异常行为检测

- **[MCP 网关](src/services/mcp-gateway.ts)**
    - MCP 协议实现
    - 工具调用网关
    - 权限验证集成

## 技术栈

- **运行时**: Node.js 16+ (官方支持)
- **语言**: TypeScript 5.0+
- **框架**: Express.js
- **AI SDK**: @anthropic-ai/claude-code ^1.0.43
    - NPM 包：`@anthropic-ai/claude-code`
    - 官方文档：https://docs.anthropic.com/en/docs/claude-code/sdk
    - 核心 API：`query` 函数
- **日志系统**: Winston ^3.11.0
    - 结构化日志记录
    - 多种输出格式
    - 敏感信息过滤
- **其他依赖**:
    - axios ^1.10.0 - HTTP 客户端
    - cors ^2.8.5 - 跨域资源共享
    - uuid ^11.1.0 - 唯一标识符生成
    - ws ^8.18.3 - WebSocket 支持
    - object-hash ^3.0.0 - 对象哈希
    - fast-json-stable-stringify ^2.1.0 - JSON 序列化
- **协议**:
    - OpenAI API 规范：https://platform.openai.com/docs/api-reference
    - MCP (Model Context Protocol)：https://docs.anthropic.com/en/docs/claude-code/mcp
    - JSON-RPC 2.0：MCP 协议基础
- **数据结构**: 
    - Trie 树：消息快照缓存
    - SHA256：内容签名和缓存键
    - EventEmitter：异步事件处理

## 核心功能

### 1. OpenAI API 兼容（✅ 完全实现）
- `/v1/chat/completions` - 聊天完成，支持流式和非流式响应
- `/v1/models` - 模型列表
- 完整的 OpenAI 格式支持

### 2. 工具调用系统（✅ 完全实现）
- 基于 MCP 协议的完整工具调用
- 异步工具调用管理（2分钟超时）
- 动态工具注册和权限验证
- Session ID 机制关联请求
- 支持批量工具调用

### 3. 会话管理（✅ 完全实现）
- 智能会话识别和恢复
- 基于 Trie 树的消息快照缓存
- 工具调用续接和会话生命周期管理

### 4. 权限控制（✅ 完全实现）
- 零信任安全架构
- 完整的权限验证流程
- 审计日志和异常行为检测
- 基于 `--permission-prompt-tool` 的权限控制

### 5. 监控和日志（✅ 完全实现）
- 统一的结构化日志系统
- 多种日志类型（app.log、access.log、claude-sdk.log 等）
- 健康检查端点，包含详细统计信息
- 性能监控和错误追踪

### 6. 模型映射
- `custom-claude-4-sonnet` → `sonnet` (Claude Code SDK)
- `custom-claude-4-opus` → `opus` (Claude Code SDK)
- 支持动态模型配置和扩展

## 实施状态

项目已完成所有预定功能，实际实现**超越**原始设计目标：

### ✅ 已完成的核心功能
1. **基础API框架** - 完整的 Express 服务器和路由
2. **OpenAI兼容性** - 完全兼容 OpenAI API 规范
3. **会话管理系统** - 智能会话管理和消息缓存
4. **MCP端点实现** - 完整的 MCP 协议支持
5. **工具调用流程** - 异步工具调用和权限控制

### 🚀 额外实现的高级功能
1. **Trie 树消息缓存** - 高效的消息快照和匹配
2. **完整的权限系统** - 零信任架构和审计日志
3. **生产级监控** - 健康检查和性能统计
4. **错误恢复机制** - 完整的错误处理和恢复
5. **流式工具响应** - 支持长时间运行的工具调用

**项目状态：生产就绪**，可直接用于生产环境。

### 特有优势
1. **无需 API Key**: 直接使用 Claude Code CLI 认证
2. **企业级功能**: 完整的权限控制和审计系统
3. **高性能架构**: Trie 树消息缓存和异步处理
4. **完整工具调用**: 支持所有 Claude Code 内置工具
5. **生产级质量**: 完善的错误处理和监控系统

## 开发指南

### 本地开发

```bash
# 安装依赖
npm install

# 开发模式（TypeScript直接运行）
npm run dev:ts

# 构建
npm run build

# 生产运行
npm start
```

### 基础测试

```bash
# 健康检查
curl http://localhost:3000/health

# 模型列表
curl http://localhost:3000/v1/models

# 聊天完成（非流式）
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model": "custom-claude-4-sonnet", "messages": [{"role": "user", "content": "Hello"}]}'

# 聊天完成（流式）
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model": "custom-claude-4-sonnet", "messages": [{"role": "user", "content": "Hello"}], "stream": true}'
```

### 工具调用测试

```bash
# 带工具调用的聊天完成
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "custom-claude-4-sonnet",
    "messages": [{"role": "user", "content": "帮我创建一个名为test.txt的文件"}],
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
          },
          "required": ["filename", "content"]
        }
      }
    }]
  }'
```

## 配置说明

### 环境变量配置

```bash
# 可选配置
PORT=3000                           # 服务端口
LOG_LEVEL=info                     # 日志级别 (debug, info, warn, error)
CLAUDE_CODE_MAX_OUTPUT_TOKENS=8000  # 最大输出 token 数
ACCESS_LOG_LEVEL=info              # 访问日志级别
CLAUDE_SDK_LOG_LEVEL=info          # SDK 日志级别
```

**注意**: 该项目使用 Claude Code SDK，不需要单独配置 ANTHROPIC_API_KEY，会自动使用系统的 Claude Code 认证。

### 生产环境部署

1. **资源要求**
   - Node.js 16+ (官方支持)
   - 最少 2GB RAM（推荐 4GB+）
   - 支持 HTTP/HTTPS 的负载均衡器
   - Claude Code CLI 已安装和配置

2. **安全配置**
   - 配置 CORS 策略
   - 使用 HTTPS
   - 配置访问日志监控
   - 定期清理临时文件

3. **监控配置**
   - 健康检查端点：`/health`
   - 日志文件位置：`./logs/`
   - 性能监控：内置统计信息

### 高级配置

详细的配置选项请参考：
- [系统架构文档](docs/ARCHITECTURE.md)
- [安全配置文档](docs/SECURITY.md)
- [日志配置文档](docs/logging.md)

## API 端点总览

### OpenAI 兼容端点
- `POST /v1/chat/completions` - 聊天完成（支持流式和工具调用）
- `GET /v1/models` - 可用模型列表
- **支持的模型**:
  - `custom-claude-4-sonnet`: 高性能通用模型
  - `custom-claude-4-opus`: 高精度复杂任务模型

### MCP 协议端点
- `POST /mcp/permission` - 权限验证服务 (JSON-RPC 2.0)
- `POST /mcp/gateway` - 工具调用网关 (JSON-RPC 2.0)
- `POST /mcp/permission/check` - 权限检查
- `POST /mcp/gateway/:tool` - 工具网关路由
- **支持的模式**:
  - 通过 `X-Session-ID` 头部进行会话管理
  - 完整的 MCP 协议实现
  - 支持批量工具调用

### 管理端点
- `GET /health` - 健康检查和统计信息
  - 服务状态和版本信息
  - 在线会话数量和统计
  - 工具调用统计和性能指标
  - 系统资源使用情况

## 相关链接

### 官方文档
- [Claude Code SDK 文档](https://docs.anthropic.com/en/docs/claude-code/sdk)
- [OpenAI API 规范](https://platform.openai.com/docs/api-reference)
- [MCP 协议说明](https://docs.anthropic.com/en/docs/claude-code/mcp)

### 项目文档
- [系统架构详细说明](docs/ARCHITECTURE.md)
- [安全设计和最佳实践](docs/SECURITY.md)
- [工具调用完整流程](docs/tool-call-flow.md)
- [日志系统使用指南](docs/logging.md)

### 开发资源
- [实现决策记录](docs/implementation-decisions.md)
- [架构总结](docs/architecture-summary.md)
- [流式工具响应设计](docs/streaming-tool-response.md)

## 更新日志

### v2.0.2 (2025-01-10)
- **新功能**: 客户端断开连接处理
  - 检测客户端主动断开连接（流式和非流式响应）
  - 自动终止相关的 Claude Code SDK 会话
  - 释放系统资源，避免内存泄漏
  - 详见 [客户端断开处理文档](docs/client-disconnect-handling.md)
- **发现**: Claude Code SDK 消息流特性
  - SDK 使用流式传输，`stop_reason` 在传输过程中通常为 `null`
  - 通过 `result` 消息类型判断 SDK 是否完成当前轮次
  - SDK 一次只返回一个工具调用，需要客户端返回结果后才会继续
  - 更新了多工具调用处理文档，明确了 SDK 的实际行为
- **修复**: 多工具调用支持
  - 正确处理 SDK 返回的多个工具调用
  - 支持混合响应（文本 + 工具调用）
  - 改进消息缓存机制，创建包含所有工具调用的快照
  - 利用 `stop_reason` 字段精确判断 SDK 状态
  - 详见 [多工具调用处理文档](docs/multi-tool-call-handling.md)
- **决策**: 不支持 maxTurns 参数
  - 保持严格的 OpenAI API 兼容性
  - OpenAI API 规范中没有对话轮数控制参数
  - 此类控制应在客户端应用层实现

### v2.0.1 (2025-01-10)
- **优化**: 移除重复的 `CLAUDE_BUILTIN_TOOLS` 定义
  - 将常量定义保留在 `/src/config/claude-tools.ts`（运行时使用）
  - 类型定义文件 `/src/types/claude-code-types.d.ts` 只保留类型声明
  - 符合 TypeScript 最佳实践：`.d.ts` 文件不应包含运行时值
- **改进**: 移除 `maxTurns = 1` 限制
  - 允许 Claude Code SDK 在单个会话中执行多轮对话
  - 支持复杂的多工具调用场景
  - 提升了会话的连续性和灵活性

### v2.0.0 (2025-01-09)
- 项目完全重构为 TypeScript
- 实现完整的生产级功能
- 添加 Trie 树消息缓存机制
- 实现零信任安全架构
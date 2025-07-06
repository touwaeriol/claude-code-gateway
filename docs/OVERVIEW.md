# Claude Code OpenAI 代理服务

## 项目概述

基于 Claude Code SDK 的 OpenAI 兼容 API 代理服务，让任何 OpenAI 客户端都能无缝使用 Claude。

### 核心特性

- ✅ **完全 OpenAI 兼容** - 支持标准的 `/v1/chat/completions` 接口
- ✅ **工具调用支持** - 完整的 Function Calling 功能
- ✅ **流式响应** - 支持 SSE 流式输出
- ✅ **安全控制** - 基于权限的工具访问控制
- ✅ **零配置** - 开箱即用，无需复杂配置

### 支持的模型

- `custom-claude-4-sonnet` - Claude Sonnet 4
- `custom-claude-4-opus` - Claude Opus 4

## 项目背景

许多应用和工具已经集成了 OpenAI API，但想要使用 Claude 就需要重新开发。本项目通过提供 OpenAI 兼容的 API 接口，让这些应用能够直接使用 Claude，无需修改代码。

## 快速开始

```bash
# 安装依赖
npm install

# 开发模式
npm run dev

# 生产构建
npm run build
npm run start
```

### 测试调用

```bash
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "custom-claude-4-sonnet",
    "messages": [{"role": "user", "content": "你好"}]
  }'
```

## 架构概览

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐     ┌──────────┐
│   Client    │────▶│  API Service │────▶│ Claude Code │────▶│  Claude  │
│  (OpenAI)   │◀────│   (Gateway)  │◀────│    SDK      │◀────│   API    │
└─────────────┘     └──────────────┘     └─────────────┘     └──────────┘
                            │                     │
                            ▼                     ▼
                    ┌──────────────┐     ┌──────────────┐
                    │     MCP      │     │ Permission   │
                    │   Gateway    │     │  Controller  │
                    └──────────────┘     └──────────────┘
```

## 主要功能

### 1. 消息转换
- OpenAI 格式 ↔ Claude 格式的双向转换
- 保持上下文的完整性
- 支持系统消息、用户消息、助手消息

### 2. 工具调用
- 将 OpenAI tools 转换为 MCP 协议
- 动态工具注册和调用
- 工具调用结果的格式转换

### 3. 安全控制
- 基于 `--permission-prompt-tool` 的权限管理
- 禁用所有 Claude Code 内置工具
- 仅允许客户端显式定义的工具
- 完整的审计日志

### 4. 流式响应
- 支持 Server-Sent Events
- 实时输出 Claude 的响应
- 兼容 OpenAI 的流式格式

## 使用场景

1. **现有 OpenAI 应用迁移**
   - 只需修改 base_url 即可使用 Claude
   - 无需修改应用代码

2. **多模型支持**
   - 在同一个应用中同时使用 OpenAI 和 Claude
   - 统一的 API 接口

3. **企业级部署**
   - 内网部署，数据不出企业网络
   - 统一的访问控制和审计

## 项目优势

1. **兼容性强** - 完全兼容 OpenAI API 规范
2. **安全可控** - 细粒度的工具权限控制
3. **易于部署** - TypeScript 开发，类型安全
4. **扩展性好** - 支持自定义 MCP 工具

## 下一步

- 查看 [架构设计](./ARCHITECTURE.md) 了解技术细节
- 查看 [安全指南](./SECURITY.md) 了解权限控制
- 查看 [API 参考](./API_REFERENCE.md) 了解接口详情
- 查看 [部署指南](./DEPLOYMENT.md) 了解生产部署
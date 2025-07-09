# Claude Code Gateway 项目说明

## 项目概述

Claude Code OpenAI 代理服务 - 提供 OpenAI 兼容的 API 接口，底层使用 Claude Code SDK，支持完整的工具调用（Function Calling）功能。

## 项目文档索引

### 1. 需求与设计文档

- **[需求文档](../docs/REQUIREMENTS.md)**
    - 项目背景和目标
    - 功能需求（API兼容性、工具调用、模型支持等）
    - 非功能需求（性能、安全、可维护性）
    - 用户故事和验收标准

- **[技术设计文档](../docs/TECHNICAL_DESIGN.md)**
    - 系统架构（单一服务设计）
    - 核心组件设计（SessionManager、MCPEndpoint、ClaudeService）
    - 统一 MCP 端口设计（请求头路由）
    - 逐步实现方案（5个阶段，12天完成）
    - API设计和数据流

- **[统一 MCP 端口设计](../docs/UNIFIED_MCP_DESIGN.md)**
    - 使用单一 Streamable HTTP 端口
    - 通过请求头区分会话和客户端
    - 动态工具分配机制
    - 客户端连接管理

- **[文档总览](../docs/README.md)**
    - 所有文档的导航入口
    - 针对不同角色的阅读指南

### 2. 主要文档

- **[项目README](../README.md)**
    - 快速开始指南
    - 安装和运行说明
    - 基本使用示例

- **[原始需求文档](../CLAUDE_CODE_OPENAI_PROXY_REQUIREMENTS.md)**
    - 已拆分为独立的需求和设计文档
    - 保留作为历史参考

### 3. 源代码

- **[主服务实现](../src/index.ts)**
    - Express服务器
    - OpenAI兼容端点
    - 基础Claude Code集成

- **[TypeScript配置](../tsconfig.json)**
    - 编译配置
    - 类型检查设置

## 技术栈

- **运行时**: Node.js 18+
- **语言**: TypeScript 5.0+
- **框架**: Express.js
- **AI SDK**: @anthropic-ai/claude-code
    - NPM 包：`@anthropic-ai/claude-code`
    - 官方文档：https://docs.anthropic.com/en/docs/claude-code/sdk
    - 核心 API：`query` 函数
- **协议**:
    - OpenAI API 规范：https://platform.openai.com/docs/api-reference
    - MCP (Model Context Protocol)：https://docs.anthropic.com/en/docs/claude-code/mcp

## 核心功能

1. **OpenAI API 兼容**
    - `/v1/chat/completions` - 聊天完成
    - `/v1/models` - 模型列表
    - 流式/非流式响应

2. **工具调用支持**（计划中）
    - 通过MCP协议实现
    - 支持动态工具注册
    - Session ID机制关联请求

3. **模型映射**
    - `custom-claude-4-sonnet` → Claude Sonnet
    - `custom-claude-4-opus` → Claude Opus

## 实施计划

根据技术设计文档，项目分5个阶段实施：

1. **阶段1**（2天）: 基础API框架
2. **阶段2**（2天）: 完善OpenAI兼容性
3. **阶段3**（2天）: 会话管理系统
4. **阶段4**（3天）: MCP端点实现
5. **阶段5**（3天）: 完整工具调用流程

总计：12天完成全部功能

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

### 测试

```bash
# 基础测试
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model": "custom-claude-4-sonnet", "messages": [{"role": "user", "content": "Hello"}]}'
```

## 注意事项

1. 当前版本还不支持工具调用，这是下一阶段的主要工作
2. 需要配置 `ANTHROPIC_API_KEY` 环境变量（可以是任意值用于测试）
3. 默认端口 3000，可通过 `PORT` 环境变量修改

## 相关链接

- [Claude Code SDK 文档](https://docs.anthropic.com/en/docs/claude-code/sdk)
- [OpenAI API 规范](https://platform.openai.com/docs/api-reference)
- [MCP 协议说明](https://docs.anthropic.com/en/docs/claude-code/mcp)
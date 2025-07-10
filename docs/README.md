# Claude Code Gateway 文档中心

## 🎯 根据需求快速定位

### 我想了解项目
→ 阅读 **[项目概览](OVERVIEW.md)** 和 **[系统架构](ARCHITECTURE.md)**

### 我要部署系统
→ 参考 **[快速开始](../README.md#快速开始)** 和 **[Claude Code SDK 指南](CLAUDE_CODE_SDK.md)**

### 我要集成 API
→ 查看 **[工具调用流程](tool-call-flow.md)** 和 **[API 端点](../README.md#api-端点总览)**

### 我关注安全性
→ 重点阅读 **[安全设计](SECURITY.md)**

## 📚 核心文档（5篇必读）

1. **[项目概览](OVERVIEW.md)** ⭐
   - 了解项目的价值和功能

2. **[系统架构](ARCHITECTURE.md)** ⭐
   - 理解系统设计和组件

3. **[工具调用流程](tool-call-flow.md)** ⭐
   - 掌握核心业务流程

4. **[安全设计](SECURITY.md)** ⭐
   - 了解安全架构

5. **[Claude Code SDK 指南](CLAUDE_CODE_SDK.md)** ⭐
   - SDK 集成和配置

## 🔧 技术实现文档

### 功能实现
- [多工具调用处理](multi-tool-call-handling.md) - SDK 工具调用行为分析
- [会话管理机制](session-management.md) - 会话生命周期
- [流式工具响应](streaming-tool-response.md) - 流式响应设计
- [串行工具调用](sequential-tool-calls.md) - 串行处理方案

### 系统集成
- [日志系统](logging.md) - 统一日志方案
- [客户端断开处理](client-disconnect-handling.md) - 连接管理
- [实现决策](implementation-decisions.md) - 技术决策记录

### 简化文档
- [架构总结](architecture-summary.md) - 架构要点总结

## 📊 文档地图

```
必读文档（5篇）
├── 项目概览 → 系统架构 → 工具调用流程
└── 安全设计 + SDK指南

技术文档（8篇）
├── 功能实现（4篇）
├── 系统集成（3篇）
└── 简化总结（1篇）
```

## 🚀 快速导航

| 我是... | 我应该看... |
|---------|------------|
| **新用户** | 项目概览 → 系统架构 |
| **开发者** | 工具调用流程 + SDK指南 |
| **运维人员** | 安全设计 + 日志系统 |
| **架构师** | 全部核心文档 |

## 📝 文档说明

- **⭐ 标记**：核心必读文档
- **更新频率**：随代码更新同步维护
- **总计文档**：13篇（5篇核心 + 8篇技术）

---

*最后更新：2025-01-10*
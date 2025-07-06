# 故障排查指南

## 常见错误和解决方案

### 1. Claude Code process exited with code 1

**症状**：
- 错误日志显示 "Claude Code process exited with code 1"
- API 调用失败
- SDK query 错误返回空对象

**原因**：
- 提示内容过长（超过 100K 字符）
- Claude CLI 未完成认证
- 系统资源不足

**解决方案**：

1. **使用 Claude CLI 认证（推荐）**：
   ```bash
   # 首先完成 Claude CLI 认证
   claude auth login
   
   # 验证认证状态
   claude auth status
   
   # 测试 CLI 是否工作
   echo "Hello" | claude --print
   
   # 认证成功后启动网关
   npm run dev
   ```

2. **检查提示长度**：
   - 如果日志显示 "提示长度：XXX 字符" 且超过 100K
   - 系统会自动截断过长的提示
   - 建议在 Cline 中清理对话历史

3. **使用环境变量（备选）**：
   ```bash
   # 如果有 API Key，可以设置环境变量
   export ANTHROPIC_API_KEY="your-api-key-here"
   npm run dev
   ```

2. **验证 API 密钥**：
   ```bash
   # 运行诊断脚本
   node diagnose-claude-code.mjs
   ```

3. **检查 Claude CLI 安装**：
   ```bash
   claude --version
   # 如果未安装，运行：
   npm install -g @anthropic-ai/claude-code
   ```

### 2. Model not found 错误

**症状**：
- 错误日志显示 "Model 'claude-3-5-sonnet-20241022' not found"

**原因**：
- 使用了错误的模型名称

**解决方案**：
- 在 Cline 设置中使用正确的模型名称：
  - `custom-claude-4-sonnet` （映射到 claude-3-5-sonnet-latest）
  - `custom-claude-3-opus` （映射到 claude-3-opus-latest）
  - `custom-claude-3-haiku` （映射到 claude-3-haiku-20240307）

### 3. MCP 服务器连接错误

**症状**：
- 工具调用失败
- 权限验证不工作

**原因**：
- MCP 服务器未正确启动
- 端口冲突

**解决方案**：
1. 确保服务器正在运行
2. 检查端口 3000 是否被占用
3. 查看 MCP 服务器日志

### 4. 内存泄漏警告

**症状**：
- MaxListenersExceededWarning

**原因**：
- 事件监听器未正确清理

**解决方案**：
- 重启服务器
- 这是已知问题，不影响功能

## 日志文件位置

- **错误日志**：`logs/error.log`
- **调试日志**：`logs/debug.log`
- **审计日志**：`logs/audit.log`
- **综合日志**：`logs/combined.log`

## 诊断命令

```bash
# 查看最新错误
tail -f logs/error.log

# 搜索特定错误
grep "exited with code" logs/error.log

# 运行诊断脚本
node diagnose-claude-code.mjs

# 测试 API
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "custom-claude-4-sonnet",
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

## 在 Cline 中使用

1. **设置 API 基础 URL**：
   ```
   http://localhost:3000/v1
   ```

2. **设置 API 密钥**：
   - 可以设置任意值（如 "sk-proxy"）
   - 真实的 API 密钥通过环境变量设置

3. **选择模型**：
   - 使用 `custom-claude-4-sonnet` 而不是原始模型名

4. **启动服务器**：
   ```bash
   # 确保设置了 ANTHROPIC_API_KEY
   export ANTHROPIC_API_KEY="your-api-key"
   npm run dev
   ```
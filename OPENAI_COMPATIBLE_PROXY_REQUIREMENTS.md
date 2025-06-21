# OpenAI兼容Claude代理服务需求文档

## 项目概述

**项目名称**: Claude OpenAI Proxy  
**目标**: 创建一个兼容OpenAI API规范的代理服务，通过复用Claude Code CLI的认证和API调用逻辑，实现对Claude模型的透明访问  
**技术栈**: Node.js + Express/Fastify + OpenAI SDK兼容接口  

## 核心需求

### 1. 服务架构设计

#### 1.1 服务定位
- **代理服务**: 作为OpenAI API和Claude API之间的桥梁
- **认证复用**: 直接使用Claude Code CLI已有的认证机制
- **协议转换**: OpenAI格式请求 → Claude API格式请求
- **透明访问**: 对客户端完全透明，无需修改现有OpenAI SDK调用代码

#### 1.2 支持的模型映射
| OpenAI兼容模型名 | Claude实际模型 | CLI中对应变量 | 说明 |
|-----------------|---------------|--------------|------|
| `custom-claude-4-opus` | Claude Opus 4 | `rU.firstParty` | 复杂任务模型 |
| `custom-claude-4-sonnet` | Claude Sonnet 4 | `EC.firstParty` | 日常使用模型 |

### 2. 认证与授权系统

#### 2.1 CLI认证状态检测
**基于CLI分析的实现逻辑**:

```javascript
// 检测逻辑（基于CLI中的DA()和相关函数）
function detectCLIAuthStatus() {
  // 1. 检查全局配置中的认证信息
  const config = readGlobalConfig(); // 对应CLI中的DA()函数
  
  // 2. 检查OAuth账户信息
  if (config.oauthAccount?.accessToken) {
    return {
      isAuthenticated: true,
      authMethod: 'oauth',
      accessToken: config.oauthAccount.accessToken,
      refreshToken: config.oauthAccount.refreshToken,
      expiresAt: config.oauthAccount.expiresAt
    };
  }
  
  // 3. 检查API Key（对应CLI中的$G()函数逻辑）
  const apiKey = getStoredApiKey();
  if (apiKey) {
    return {
      isAuthenticated: true,
      authMethod: 'apikey',
      apiKey: apiKey
    };
  }
  
  return { isAuthenticated: false };
}
```

#### 2.2 凭据存储访问
**基于CLI存储机制的实现**:

```javascript
// macOS Keychain访问（基于CLI中的zmA()函数）
function readFromKeychain() {
  // 使用与CLI相同的服务名生成逻辑
  const serviceName = generateServiceName(); // 对应Pn()函数
  // 执行security命令读取keychain
  return executeSecurityCommand(`find-generic-password -a $USER -w -s "${serviceName}"`);
}

// 文件系统存储访问（基于CLI中的jS1()函数）
function readFromFileSystem() {
  const configDir = getUserConfigDir(); // 对应P4()函数
  const credentialsPath = path.join(configDir, '.credentials.json');
  // 读取加密存储的凭据文件
}
```

#### 2.3 Token管理
**基于CLI Token管理逻辑**:

```javascript
// Token刷新逻辑（基于CLI中的NmA()函数）
async function refreshAccessToken(refreshToken) {
  const tokenData = {
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: getClientId() // 对应BB().CLIENT_ID
  };
  
  const response = await httpClient.post(getTokenURL(), tokenData);
  return response.data;
}

// Token有效性检查
function isTokenValid(tokenInfo) {
  if (!tokenInfo.expiresAt) return true;
  return new Date(tokenInfo.expiresAt) > new Date();
}
```

### 3. OpenAI API兼容层

#### 3.1 支持的API端点

##### 3.1.1 Chat Completions (核心功能)
**端点**: `POST /v1/chat/completions`

**请求格式转换**:
```javascript
// OpenAI格式 → Claude格式
function convertOpenAIToClaude(openaiRequest) {
  return {
    model: mapModelName(openaiRequest.model), // 映射模型名称
    messages: convertMessages(openaiRequest.messages),
    max_tokens: openaiRequest.max_tokens || 4096,
    temperature: openaiRequest.temperature,
    stream: openaiRequest.stream || false,
    // 其他Claude特有参数
  };
}
```

**模型名称映射**:
```javascript
const MODEL_MAPPING = {
  'custom-claude-4-opus': 'claude-opus-4-20250514',
  'custom-claude-4-sonnet': 'claude-sonnet-4-20250514'
};
```

##### 3.1.2 Models列表
**端点**: `GET /v1/models`

**返回格式**:
```json
{
  "object": "list",
  "data": [
    {
      "id": "custom-claude-4-opus",
      "object": "model",
      "created": 1677610602,
      "owned_by": "anthropic",
      "permission": [],
      "root": "custom-claude-4-opus",
      "parent": null
    },
    {
      "id": "custom-claude-4-sonnet", 
      "object": "model",
      "created": 1677610602,
      "owned_by": "anthropic",
      "permission": [],
      "root": "custom-claude-4-sonnet",
      "parent": null
    }
  ]
}
```

#### 3.2 流式响应支持
**基于CLI流式处理逻辑**:

```javascript
// 流式响应转换
function convertClaudeStreamToOpenAI(claudeStream) {
  return claudeStream.transform(chunk => {
    // Claude SSE格式 → OpenAI SSE格式
    return {
      id: generateId(),
      object: "chat.completion.chunk",
      created: Math.floor(Date.now() / 1000),
      model: chunk.model,
      choices: [{
        index: 0,
        delta: {
          content: chunk.delta?.text || ""
        },
        finish_reason: chunk.stop_reason || null
      }]
    };
  });
}
```

### 4. Claude API调用层

#### 4.1 HTTP客户端配置
**基于CLI网络配置**:

```javascript
// HTTP客户端初始化（对应CLI中的T4）
const httpClient = axios.create({
  baseURL: getBaseApiURL(), // 对应BB().BASE_API_URL
  timeout: 60000,
  headers: {
    'User-Agent': 'Claude-OpenAI-Proxy/1.0.0',
    'anthropic-version': '2023-06-01'
  }
});
```

#### 4.2 请求认证
**基于CLI认证逻辑**:

```javascript
// 请求拦截器添加认证
httpClient.interceptors.request.use(async (config) => {
  const authInfo = await getAuthInfo();
  
  if (authInfo.authMethod === 'oauth') {
    // 检查Token是否需要刷新
    if (!isTokenValid(authInfo)) {
      const newToken = await refreshAccessToken(authInfo.refreshToken);
      updateStoredToken(newToken);
      authInfo.accessToken = newToken.access_token;
    }
    config.headers.Authorization = `Bearer ${authInfo.accessToken}`;
  } else if (authInfo.authMethod === 'apikey') {
    config.headers['x-api-key'] = authInfo.apiKey;
  }
  
  return config;
});
```

#### 4.3 错误处理
**基于CLI错误处理逻辑**:

```javascript
// 错误响应转换
function convertClaudeErrorToOpenAI(claudeError) {
  const errorMap = {
    'invalid_request_error': 'invalid_request_error',
    'authentication_error': 'invalid_api_key',
    'permission_error': 'insufficient_quota',
    'not_found_error': 'model_not_found',
    'rate_limit_error': 'rate_limit_exceeded',
    'api_error': 'api_error'
  };
  
  return {
    error: {
      message: claudeError.message,
      type: errorMap[claudeError.type] || 'api_error',
      code: claudeError.error?.code || null
    }
  };
}
```

### 5. 配置管理系统

#### 5.1 配置文件结构
**基于CLI配置结构**:

```json
{
  "server": {
    "port": 3000,
    "host": "localhost",
    "cors": {
      "enabled": true,
      "origins": ["*"]
    }
  },
  "claude": {
    "configPath": "~/.claude-code", // CLI配置目录
    "fallbackModel": "custom-claude-4-sonnet",
    "maxRetries": 3,
    "timeout": 60000
  },
  "logging": {
    "level": "info",
    "enableRequestLogging": true
  }
}
```

#### 5.2 CLI配置路径检测
**基于CLI配置目录逻辑**:

```javascript
// 配置目录检测（对应CLI中的P4()函数）
function detectCLIConfigPath() {
  // 1. 检查环境变量
  if (process.env.CLAUDE_CONFIG_DIR) {
    return process.env.CLAUDE_CONFIG_DIR;
  }
  
  // 2. 默认路径
  const os = require('os');
  const path = require('path');
  
  switch (process.platform) {
    case 'darwin':
      return path.join(os.homedir(), '.claude-code');
    case 'win32':
      return path.join(os.homedir(), 'AppData', 'Roaming', 'claude-code');
    default:
      return path.join(os.homedir(), '.claude-code');
  }
}
```

### 6. 启动流程设计

#### 6.1 服务启动检查清单

```javascript
async function startupChecks() {
  console.log('🚀 启动Claude OpenAI代理服务...');
  
  // 1. 检测CLI安装
  const cliInstalled = await checkCLIInstallation();
  if (!cliInstalled) {
    throw new Error('❌ 未检测到Claude Code CLI安装，请先安装CLI');
  }
  
  // 2. 检测认证状态
  const authStatus = await detectCLIAuthStatus();
  if (!authStatus.isAuthenticated) {
    throw new Error(`
❌ 未检测到有效的认证信息

请先通过以下方式完成登录：
1. 运行: claude auth login
2. 或设置环境变量: export ANTHROPIC_API_KEY=your_api_key

认证完成后重新启动服务。
    `);
  }
  
  console.log(`✅ 认证检查通过 (${authStatus.authMethod})`);
  
  // 3. 测试API连接
  const apiTest = await testClaudeAPIConnection(authStatus);
  if (!apiTest.success) {
    throw new Error(`❌ Claude API连接测试失败: ${apiTest.error}`);
  }
  
  console.log('✅ Claude API连接测试通过');
  
  // 4. 检查模型访问权限
  const modelAccess = await checkModelAccess(authStatus);
  console.log(`✅ 可用模型: ${modelAccess.availableModels.join(', ')}`);
  
  return authStatus;
}
```

#### 6.2 服务启动流程

```javascript
async function startServer() {
  try {
    // 启动检查
    const authInfo = await startupChecks();
    
    // 初始化服务
    const app = createExpressApp();
    setupRoutes(app, authInfo);
    setupErrorHandling(app);
    
    // 启动HTTP服务器
    const server = app.listen(config.server.port, config.server.host, () => {
      console.log(`
🎉 Claude OpenAI代理服务启动成功！

📡 服务地址: http://${config.server.host}:${config.server.port}
🤖 支持模型: 
   - custom-claude-4-opus (Claude Opus 4)
   - custom-claude-4-sonnet (Claude Sonnet 4)

📖 使用示例:
   curl -X POST http://localhost:3000/v1/chat/completions \\
     -H "Content-Type: application/json" \\
     -H "Authorization: Bearer dummy-key" \\
     -d '{
       "model": "custom-claude-4-sonnet",
       "messages": [{"role": "user", "content": "Hello!"}]
     }'

🔧 OpenAI SDK配置:
   const openai = new OpenAI({
     baseURL: "http://localhost:3000/v1",
     apiKey: "dummy-key" // 任意值，代理服务使用CLI认证
   });
      `);
    });
    
    // 优雅关闭处理
    process.on('SIGTERM', () => gracefulShutdown(server));
    process.on('SIGINT', () => gracefulShutdown(server));
    
  } catch (error) {
    console.error('❌ 服务启动失败:', error.message);
    process.exit(1);
  }
}
```

### 7. API兼容性规范

#### 7.1 请求头处理
```javascript
// 兼容OpenAI SDK的请求头
const COMPATIBLE_HEADERS = {
  'authorization': 'Authorization',
  'content-type': 'Content-Type',
  'user-agent': 'User-Agent',
  'openai-organization': 'X-OpenAI-Organization', // 忽略但不报错
  'openai-project': 'X-OpenAI-Project' // 忽略但不报错
};
```

#### 7.2 响应格式标准化
```javascript
// 确保响应格式完全兼容OpenAI
function formatOpenAIResponse(claudeResponse, requestModel) {
  return {
    id: `chatcmpl-${generateId()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: requestModel, // 返回请求中的模型名
    choices: [{
      index: 0,
      message: {
        role: "assistant",
        content: claudeResponse.content[0].text
      },
      finish_reason: mapFinishReason(claudeResponse.stop_reason)
    }],
    usage: {
      prompt_tokens: claudeResponse.usage?.input_tokens || 0,
      completion_tokens: claudeResponse.usage?.output_tokens || 0,
      total_tokens: (claudeResponse.usage?.input_tokens || 0) + (claudeResponse.usage?.output_tokens || 0)
    }
  };
}
```

### 8. 监控与日志

#### 8.1 请求日志
```javascript
// 请求/响应日志中间件
function requestLogger(req, res, next) {
  const startTime = Date.now();
  const requestId = generateRequestId();
  
  console.log(`[${requestId}] ${req.method} ${req.path} - ${req.ip}`);
  
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    console.log(`[${requestId}] ${res.statusCode} - ${duration}ms`);
  });
  
  req.requestId = requestId;
  next();
}
```

#### 8.2 健康检查端点
```javascript
// 健康检查端点
app.get('/health', async (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: packageInfo.version,
    cli: {
      authenticated: false,
      authMethod: null
    },
    claude_api: {
      accessible: false,
      latency: null
    }
  };
  
  try {
    // 检查CLI认证状态
    const authStatus = await detectCLIAuthStatus();
    health.cli.authenticated = authStatus.isAuthenticated;
    health.cli.authMethod = authStatus.authMethod;
    
    // 检查Claude API连接
    const apiTest = await testClaudeAPIConnection(authStatus);
    health.claude_api.accessible = apiTest.success;
    health.claude_api.latency = apiTest.latency;
    
  } catch (error) {
    health.status = 'unhealthy';
    health.error = error.message;
  }
  
  res.json(health);
});
```

### 9. 错误处理策略

#### 9.1 认证错误处理
```javascript
class AuthenticationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AuthenticationError';
    this.statusCode = 401;
    this.openaiError = {
      error: {
        message: 'CLI认证失效，请重新登录',
        type: 'invalid_api_key',
        code: 'cli_auth_expired'
      }
    };
  }
}
```

#### 9.2 模型不可用处理
```javascript
class ModelUnavailableError extends Error {
  constructor(model) {
    super(`模型 ${model} 当前不可用`);
    this.name = 'ModelUnavailableError';
    this.statusCode = 404;
    this.openaiError = {
      error: {
        message: `The model '${model}' does not exist`,
        type: 'invalid_request_error',
        code: 'model_not_found'
      }
    };
  }
}
```

### 10. 部署与运维

#### 10.1 Docker支持
```dockerfile
FROM node:18-alpine

# 安装Claude CLI
RUN npm install -g @anthropic-ai/claude-code

# 复制代理服务代码
COPY . /app
WORKDIR /app
RUN npm install

# 暴露端口
EXPOSE 3000

# 启动命令
CMD ["node", "server.js"]
```

#### 10.2 环境变量配置
```bash
# 服务配置
PROXY_PORT=3000
PROXY_HOST=0.0.0.0

# Claude CLI配置路径（可选）
CLAUDE_CONFIG_DIR=/home/user/.claude-code

# 日志级别
LOG_LEVEL=info

# CORS配置
CORS_ORIGINS=*

# 认证检查间隔（秒）
AUTH_CHECK_INTERVAL=300
```

## 技术实现要求

### 1. 核心依赖
- **HTTP框架**: Express.js 或 Fastify
- **HTTP客户端**: Axios（与CLI保持一致）
- **流处理**: Node.js Streams
- **配置管理**: dotenv + JSON配置文件
- **日志**: Winston 或 Pino

### 2. 性能要求
- **响应时间**: 非流式请求 < 2秒，流式请求首字节 < 500ms
- **并发支持**: 至少支持100个并发请求
- **内存使用**: 常驻内存 < 100MB
- **错误率**: < 1%

### 3. 兼容性要求
- **OpenAI SDK**: 完全兼容官方Python/Node.js SDK
- **API版本**: 兼容OpenAI API v1
- **模型名称**: 支持自定义模型名称映射
- **流式响应**: 完全兼容SSE格式

### 4. 安全要求
- **认证复用**: 不存储用户凭据，完全依赖CLI认证
- **请求验证**: 严格验证请求格式和参数
- **错误信息**: 不泄露敏感的CLI内部信息
- **访问控制**: 支持IP白名单（可选）

## 验收标准

### 1. 功能验收
- [ ] 服务启动时正确检测CLI认证状态
- [ ] 支持两个自定义模型的调用
- [ ] OpenAI SDK可正常调用所有支持的API
- [ ] 流式和非流式响应均正常工作
- [ ] 错误处理符合OpenAI API规范

### 2. 性能验收
- [ ] 单请求响应时间符合要求
- [ ] 并发测试通过
- [ ] 长时间运行稳定性测试通过
- [ ] 内存泄漏测试通过

### 3. 兼容性验收
- [ ] 官方OpenAI Python SDK兼容性测试通过
- [ ] 官方OpenAI Node.js SDK兼容性测试通过
- [ ] 第三方工具（如Postman、curl）调用正常
- [ ] 各种参数组合测试通过

### 4. 运维验收
- [ ] Docker部署测试通过
- [ ] 健康检查端点正常工作
- [ ] 日志记录完整且格式正确
- [ ] 优雅关闭功能正常

## 项目交付物

1. **代理服务源码** - 完整的Node.js应用程序
2. **配置文件模板** - 包含所有可配置项的示例
3. **Docker文件** - 支持容器化部署
4. **API文档** - 详细的API使用说明
5. **部署指南** - 完整的部署和配置说明
6. **测试用例** - 包含单元测试和集成测试
7. **监控仪表板** - 可选的监控和统计界面

---

**备注**: 本需求文档基于对Claude Code CLI v1.0.30的深入分析，确保与CLI的认证机制和API调用逻辑完全兼容。所有技术实现细节均参考CLI源码中的实际实现。 
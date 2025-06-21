import express from 'express';
import cors from 'cors';
import { config } from './config/index.js';
import { logger } from './utils/logger.js';
import { CLIAuthManager } from './auth/cli-auth.js';
import { ClaudeClient } from './claude/client.js';
import { createOpenAIRoutes } from './routes/openai.js';
import { createHealthRoutes } from './routes/health.js';
import { requestLogger } from './middleware/request-logger.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';

export async function createApp() {
  const app = express();

  // 中间件
  app.use(cors({
    origin: config.cors.origins,
    credentials: true
  }));
  app.use(express.json({ limit: '10mb' }));
  app.use(requestLogger);

  // 初始化认证管理器
  const authManager = new CLIAuthManager();
  
  // 检查认证状态
  const authStatus = await authManager.checkAuthentication();
  if (!authStatus.isAuthenticated) {
    throw new Error(`
未检测到有效的 Claude CLI 认证信息。

请通过以下方式之一完成认证：
1. 运行命令：claude auth login
2. 设置环境变量：export ANTHROPIC_API_KEY=your_api_key

完成认证后，请重新启动代理服务。
    `);
  }

  logger.info(`CLI 认证检测成功 (${authStatus.authMethod})`);
  await authManager.updateAuthInfo(authStatus);

  // 初始化 Claude 客户端
  const claudeClient = new ClaudeClient(authManager);

  // 路由
  app.use(createHealthRoutes(authManager));
  app.use(createOpenAIRoutes(claudeClient));

  // 404 处理
  app.use(notFoundHandler);

  // 错误处理
  app.use(errorHandler);

  return { app, authManager };
}
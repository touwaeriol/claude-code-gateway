import { createApp } from './app.js';
import { config } from './config/index.js';
import { logger } from './utils/logger.js';

async function startServer() {
  try {
    logger.info('🚀 启动 Claude OpenAI 代理服务...');

    // 创建应用
    const { app, authManager } = await createApp();

    // 启动服务器
    const server = app.listen(config.server.port, config.server.host, () => {
      logger.info(`
🎉 Claude OpenAI 代理服务启动成功！

📡 服务地址: http://${config.server.host}:${config.server.port}
🤖 支持模型: 
   - custom-claude-4-opus (Claude Opus 4)
   - custom-claude-4-sonnet (Claude Sonnet 4)

📖 使用示例:
   curl -X POST http://localhost:${config.server.port}/v1/chat/completions \\
     -H "Content-Type: application/json" \\
     -H "Authorization: Bearer any-value" \\
     -d '{
       "model": "custom-claude-4-sonnet",
       "messages": [{"role": "user", "content": "Hello!"}]
     }'

🔧 OpenAI SDK 配置:
   const openai = new OpenAI({
     baseURL: "http://localhost:${config.server.port}/v1",
     apiKey: "any-value"
   });

📊 健康检查: http://localhost:${config.server.port}/health
      `);
    });

    // 优雅关闭
    const gracefulShutdown = async (signal) => {
      logger.info(`收到 ${signal} 信号，准备优雅关闭...`);
      
      server.close(() => {
        logger.info('HTTP 服务器已关闭');
        process.exit(0);
      });

      // 10秒后强制退出
      setTimeout(() => {
        logger.error('无法优雅关闭，强制退出');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // 未捕获的异常处理
    process.on('uncaughtException', (error) => {
      logger.error('未捕获的异常:', error);
      process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('未处理的 Promise 拒绝:', reason);
      process.exit(1);
    });

  } catch (error) {
    logger.error('❌ 服务启动失败:', error.message);
    if (error.stack) {
      logger.debug(error.stack);
    }
    process.exit(1);
  }
}

// 启动服务
startServer();
import express from 'express';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

export function createHealthRoutes(authManager) {
  const router = express.Router();

  router.get('/health', async (req, res) => {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      cli: {
        authenticated: false,
        authMethod: null,
        configDir: config.claude.configDir
      },
      models: {
        available: Object.keys(config.models.mapping)
      }
    };

    try {
      // 检查 CLI 认证状态
      const authStatus = await authManager.checkAuthentication();
      health.cli.authenticated = authStatus.isAuthenticated;
      health.cli.authMethod = authStatus.authMethod || null;
      
      if (authStatus.subscriptionType) {
        health.cli.subscriptionType = authStatus.subscriptionType;
      }
    } catch (error) {
      health.status = 'unhealthy';
      health.error = error.message;
      logger.error('Health check failed:', error);
    }

    const statusCode = health.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(health);
  });

  return router;
}
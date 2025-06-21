import fs from 'fs/promises';
import { execSync } from 'child_process';
import path from 'path';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

export class CLIAuthManager {
  constructor() {
    this.configPath = path.join(config.claude.configDir, 'config.json');
    this.credentialsPath = path.join(config.claude.configDir, '.credentials.json');
    this.authInfo = null;
  }

  async checkAuthentication() {
    try {
      // 首先检查配置文件是否存在
      const configExists = await this.fileExists(this.configPath);
      if (!configExists) {
        logger.warn('Claude CLI config file not found');
        return { isAuthenticated: false, error: 'CLI config not found' };
      }

      // 读取配置文件
      const configData = await this.readConfig();
      
      // 检查 OAuth 认证
      if (configData.oauthAccount?.accessToken) {
        logger.info('Found OAuth authentication');
        return {
          isAuthenticated: true,
          authMethod: 'oauth',
          accessToken: configData.oauthAccount.accessToken,
          refreshToken: configData.oauthAccount.refreshToken,
          expiresAt: configData.oauthAccount.expiresAt,
          subscriptionType: configData.oauthAccount.subscriptionType
        };
      }

      // 检查 API Key
      const apiKey = await this.getStoredApiKey(configData);
      if (apiKey) {
        logger.info('Found API Key authentication');
        return {
          isAuthenticated: true,
          authMethod: 'apikey',
          apiKey: apiKey
        };
      }

      // 检查环境变量
      if (process.env.ANTHROPIC_API_KEY) {
        logger.info('Found API Key in environment variable');
        return {
          isAuthenticated: true,
          authMethod: 'apikey',
          apiKey: process.env.ANTHROPIC_API_KEY
        };
      }

      return { isAuthenticated: false, error: 'No authentication found' };
    } catch (error) {
      logger.error('Error checking authentication:', error);
      return { isAuthenticated: false, error: error.message };
    }
  }

  async readConfig() {
    try {
      const content = await fs.readFile(this.configPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      logger.error('Error reading config file:', error);
      throw new Error('Failed to read CLI config file');
    }
  }

  async getStoredApiKey(configData) {
    // 检查配置中的 primaryApiKey
    if (configData.primaryApiKey) {
      return configData.primaryApiKey;
    }

    // macOS: 尝试从 Keychain 读取
    if (process.platform === 'darwin') {
      try {
        const serviceName = this.getKeychainServiceName();
        const apiKey = execSync(
          `security find-generic-password -a $USER -w -s "${serviceName}" 2>/dev/null`,
          { encoding: 'utf-8' }
        ).trim();
        
        if (apiKey) {
          return apiKey;
        }
      } catch (error) {
        logger.debug('No API key found in Keychain');
      }
    }

    // 检查 credentials 文件
    try {
      const credentialsExists = await this.fileExists(this.credentialsPath);
      if (credentialsExists) {
        const credentials = JSON.parse(await fs.readFile(this.credentialsPath, 'utf-8'));
        if (credentials.apiKey) {
          return credentials.apiKey;
        }
      }
    } catch (error) {
      logger.debug('No credentials file found');
    }

    return null;
  }

  getKeychainServiceName() {
    // 基于 CLI 代码分析，服务名为 "Claude Code"
    let serviceName = 'Claude Code';
    
    // 如果有自定义配置目录，添加哈希后缀
    if (process.env.CLAUDE_CONFIG_DIR) {
      const crypto = require('crypto');
      const hash = crypto.createHash('sha256')
        .update(config.claude.configDir)
        .digest('hex')
        .substring(0, 8);
      serviceName += `-${hash}`;
    }
    
    return serviceName;
  }

  async fileExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async refreshToken(refreshToken) {
    // TODO: 实现 token 刷新逻辑
    throw new Error('Token refresh not implemented yet');
  }

  isTokenExpired(expiresAt) {
    if (!expiresAt) return false;
    return new Date(expiresAt) <= new Date();
  }

  async updateAuthInfo(authInfo) {
    this.authInfo = authInfo;
    // 如果是 OAuth 且 token 过期，尝试刷新
    if (authInfo.authMethod === 'oauth' && this.isTokenExpired(authInfo.expiresAt)) {
      logger.info('Access token expired, attempting to refresh');
      try {
        const newAuthInfo = await this.refreshToken(authInfo.refreshToken);
        this.authInfo = newAuthInfo;
      } catch (error) {
        logger.error('Failed to refresh token:', error);
        throw new Error('Authentication expired, please login again via CLI');
      }
    }
  }

  getAuthHeaders() {
    if (!this.authInfo || !this.authInfo.isAuthenticated) {
      throw new Error('Not authenticated');
    }

    if (this.authInfo.authMethod === 'oauth') {
      return {
        'Authorization': `Bearer ${this.authInfo.accessToken}`
      };
    } else if (this.authInfo.authMethod === 'apikey') {
      return {
        'x-api-key': this.authInfo.apiKey
      };
    }

    throw new Error('Unknown authentication method');
  }
}
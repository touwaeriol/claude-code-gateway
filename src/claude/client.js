import axios from 'axios';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

export class ClaudeClient {
  constructor(authManager) {
    this.authManager = authManager;
    this.apiClient = axios.create({
      baseURL: config.claude.apiBaseUrl,
      timeout: config.claude.apiTimeout,
      headers: {
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      }
    });

    // 请求拦截器添加认证
    this.apiClient.interceptors.request.use(
      async (requestConfig) => {
        const authHeaders = this.authManager.getAuthHeaders();
        requestConfig.headers = { ...requestConfig.headers, ...authHeaders };
        return requestConfig;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // 响应拦截器处理错误
    this.apiClient.interceptors.response.use(
      (response) => response,
      async (error) => {
        if (error.response?.status === 401) {
          logger.error('Authentication failed, token may be expired');
          // TODO: 尝试刷新 token
        }
        return Promise.reject(error);
      }
    );
  }

  async createMessage(messages, options = {}) {
    try {
      const requestBody = {
        model: options.model,
        messages: messages,
        max_tokens: options.max_tokens || 4096,
        temperature: options.temperature,
        stream: options.stream || false
      };

      // 添加系统提示
      if (options.system) {
        requestBody.system = options.system;
      }

      // 添加工具定义
      if (options.tools && options.tools.length > 0) {
        requestBody.tools = options.tools;
      }

      // 添加其他参数
      Object.assign(requestBody, options.additionalParams);

      const response = await this.apiClient.post('/v1/messages', requestBody);

      return response.data;
    } catch (error) {
      logger.error('Claude API error:', error.response?.data || error.message);
      throw this.transformError(error);
    }
  }

  async createStreamingMessage(messages, options = {}) {
    try {
      const requestBody = {
        model: options.model,
        messages: messages,
        max_tokens: options.max_tokens || 4096,
        temperature: options.temperature,
        stream: true
      };

      // 添加系统提示
      if (options.system) {
        requestBody.system = options.system;
      }

      // 添加工具定义
      if (options.tools && options.tools.length > 0) {
        requestBody.tools = options.tools;
      }

      // 添加其他参数
      Object.assign(requestBody, options.additionalParams);

      const response = await this.apiClient.post('/v1/messages', requestBody, {
        responseType: 'stream'
      });

      return response.data;
    } catch (error) {
      logger.error('Claude streaming API error:', error.response?.data || error.message);
      throw this.transformError(error);
    }
  }

  transformError(error) {
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;

      const errorMap = {
        400: 'invalid_request_error',
        401: 'authentication_error',
        403: 'permission_error',
        404: 'not_found_error',
        429: 'rate_limit_error',
        500: 'api_error'
      };

      return {
        status: status,
        type: errorMap[status] || 'api_error',
        message: data?.error?.message || 'An error occurred with the Claude API',
        code: data?.error?.type || null
      };
    }

    return {
      status: 500,
      type: 'network_error',
      message: error.message || 'Network error occurred',
      code: 'network_error'
    };
  }
}
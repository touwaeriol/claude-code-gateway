#!/usr/bin/env node

import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import { query } from '@anthropic-ai/claude-code';
import { v4 as uuidv4 } from 'uuid';
import cors from 'cors';
import { overrideConsole } from './utils/console-override';
import { setupGracefulShutdown, checkPort, killPortProcess } from './utils/graceful-shutdown';

// 立即重写 console，确保所有输出都被记录
overrideConsole();

// 导入类型
import { 
  ChatCompletionRequest, 
  ChatCompletionResponse, 
  ChatCompletionChunk,
  ErrorResponse 
} from './types/openai';
import { SDKMessage, CLAUDE_BUILTIN_TOOLS } from './types/claude';

// 导入服务
import { SessionManager } from './services/session-manager';
import { MessageConverter } from './services/message-converter';
import { PermissionController } from './services/permission-controller';
import { MCPGateway } from './services/mcp-gateway';
import { MCPServer } from './services/mcp-server';
import { ToolManager } from './services/tool-manager';
import { ClaudeService } from './services/claude-service';
import { logger, LogLevel, LogCategory } from './services/logger';
import { ErrorHandler, AppError, ValidationError, NotFoundError } from './services/error-handler';

// 导入中间件
import { requestLogging, errorHandling, notFoundHandler } from './middleware/logging';

class ClaudeCodeGateway {
  private app: express.Application;
  private sessionManager: SessionManager;
  private messageConverter: MessageConverter;
  private permissionController: PermissionController;
  private mcpGateway: MCPGateway;
  private mcpServer: MCPServer;
  private toolManager: ToolManager;
  private claudeService: ClaudeService;
  private port: number;

  constructor(port: number = 3000) {
    this.port = port;
    this.app = express();
    
    // 初始化服务
    this.sessionManager = new SessionManager();
    this.messageConverter = new MessageConverter();
    this.permissionController = new PermissionController(this.sessionManager);
    this.mcpGateway = new MCPGateway(this.sessionManager, this.permissionController);
    this.mcpServer = new MCPServer(this.sessionManager, this.permissionController, this.mcpGateway);
    this.toolManager = new ToolManager();
    this.claudeService = new ClaudeService(this.sessionManager, port);
    
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    // CORS
    this.app.use(cors({
      origin: process.env.CORS_ORIGIN || '*',
      credentials: true
    }));

    // 请求解析
    this.app.use(express.json({ limit: '50mb' }));
    this.app.use(express.urlencoded({ extended: true }));

    // 请求日志
    this.app.use(requestLogging);

    // 健康检查（不需要认证）
    this.app.get('/health', this.handleHealth.bind(this));

    // API 认证中间件
    this.app.use('/v1/*', this.authMiddleware.bind(this));
  }

  private setupRoutes(): void {
    // OpenAI 兼容接口
    this.app.post('/v1/chat/completions', this.asyncHandler(this.handleChatCompletion.bind(this)));
    this.app.get('/v1/models', this.handleModels.bind(this));
    this.app.get('/v1/models/:model_id', this.handleModelDetail.bind(this));
    
    // MCP 端点
    this.app.post('/mcp/permission/check', this.asyncHandler(this.handlePermissionCheck.bind(this)));
    this.app.post('/mcp/gateway/:tool', this.asyncHandler(this.handleToolGateway.bind(this)));
    
    // MCP JSON-RPC 端点
    this.app.post('/mcp/permission', this.asyncHandler(this.handleMcpPermission.bind(this)));
    this.app.post('/mcp/gateway', this.asyncHandler(this.handleMcpGateway.bind(this)));
    
    // 404 处理
    this.app.use(notFoundHandler);
    
    // 错误处理（必须放在最后）
    this.app.use(errorHandling);
  }

  /**
   * 异步路由处理器包装
   */
  private asyncHandler(fn: Function) {
    return (req: Request, res: Response, next: NextFunction) => {
      Promise.resolve(fn(req, res, next)).catch(next);
    };
  }

  private authMiddleware(req: Request, res: Response, next: NextFunction): void {
    const authHeader = req.headers.authorization;
    
    // 记录认证信息
    if (authHeader) {
      logger.audit('auth_attempt', {
        requestId: req.requestId,
        hasAuth: true,
        authType: authHeader.startsWith('Bearer ') ? 'bearer' : 'other'
      });
    }
    
    next();
  }

  private handleHealth(req: Request, res: Response): void {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      sessions: this.sessionManager.getActiveSessionCount(),
      metrics: logger.getMetrics()
    };
    
    res.json(health);
  }

  private async handleChatCompletion(
    req: Request<{}, any, ChatCompletionRequest>, 
    res: Response
  ): Promise<void> {
    const requestId = req.requestId!;
    const sessionId = uuidv4();
    
    try {
      const {
        model = 'custom-claude-4-sonnet',
        messages,
        tools,
        stream = false,
        temperature,
        max_tokens
      } = req.body;

      // 验证请求
      this.validateChatRequest(req.body);

      // 注册会话和工具权限
      if (tools && tools.length > 0) {
        this.permissionController.registerSession(sessionId, tools);
      } else {
        // 即使没有工具也创建会话
        this.sessionManager.createSession(sessionId);
      }

      // 构建 Claude prompt
      const prompt = this.messageConverter.buildClaudePrompt(messages, sessionId, tools);
      const claudeModel = this.mapModelName(model);
      
      // 调试：记录消息内容类型
      console.log('消息详情:');
      messages.forEach((msg, index) => {
        const contentLength = msg.content 
          ? (typeof msg.content === 'string' ? msg.content.length : JSON.stringify(msg.content).length)
          : 0;
        console.log(`  消息${index + 1} - role: ${msg.role}, content类型: ${typeof msg.content}, content长度: ${contentLength}`);
        if (msg.content && typeof msg.content !== 'string') {
          console.log(`  警告：消息${index + 1}的content不是字符串:`, JSON.stringify(msg.content).substring(0, 200) + '...');
        }
      });

      // 记录请求详情
      logger.audit('chat_request', {
        requestId,
        sessionId,
        model,
        claudeModel,
        messageCount: messages.length,
        toolCount: tools?.length || 0,
        stream
      });

      if (stream) {
        await this.handleStreamResponse(res, prompt, model, claudeModel, sessionId, requestId);
      } else {
        console.log('开始调用 Claude Service...');
        console.log('完整 Prompt:\n', prompt);
        console.log('Prompt长度:', prompt.length, '字符');
        console.log('Model:', claudeModel);
        
        try {
          const claudeMessages = await this.claudeService.query(prompt, {
            sessionId,
            model: claudeModel,
            tools,
            maxTurns: 1
          });
          
          console.log('Claude 响应消息数:', claudeMessages.length);
          
          const response = this.formatResponse(claudeMessages, model, sessionId);
          console.log('格式化后的响应:', JSON.stringify(response, null, 2));
          res.json(response);
        } catch (error) {
          console.error('Claude Service 调用失败:', error);
          throw error;
        }
      }

    } catch (error) {
      // 错误处理由中间件处理
      throw error;
    }
  }

  private validateChatRequest(request: ChatCompletionRequest): void {
    // 验证模型
    if (!this.isModelSupported(request.model)) {
      throw new NotFoundError(`Model '${request.model}'`);
    }

    // 验证消息
    if (!request.messages || !Array.isArray(request.messages) || request.messages.length === 0) {
      throw new ValidationError('Messages array is required and must not be empty');
    }

    // 验证工具
    if (request.tools) {
      for (const tool of request.tools) {
        if (!tool.function?.name) {
          throw new ValidationError('Tool function name is required');
        }
      }
    }
  }

  private formatResponse(
    claudeMessages: SDKMessage[], 
    model: string,
    sessionId: string
  ): ChatCompletionResponse {
    const { content, toolCalls } = this.messageConverter.convertClaudeMessage(claudeMessages);
    
    // 计算 token 使用量（从 SDK 消息中提取）
    const usage = this.extractUsage(claudeMessages);
    
    return {
      id: `chatcmpl-${uuidv4()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content,
          tool_calls: toolCalls
        },
        finish_reason: toolCalls ? 'tool_calls' : 'stop'
      }],
      usage: usage || {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0
      }
    };
  }

  private extractUsage(messages: SDKMessage[]): any {
    // 查找包含 usage 信息的消息
    for (const msg of messages) {
      if (msg.type === 'result' && 'usage' in msg) {
        return {
          prompt_tokens: msg.usage.input_tokens || 0,
          completion_tokens: msg.usage.output_tokens || 0,
          total_tokens: (msg.usage.input_tokens || 0) + (msg.usage.output_tokens || 0)
        };
      }
    }
    return null;
  }

  private async handleStreamResponse(
    res: Response,
    prompt: string,
    model: string,
    claudeModel: string,
    sessionId: string,
    requestId: string
  ): Promise<void> {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Request-ID': requestId
    });

    const chatId = `chatcmpl-${uuidv4()}`;
    const created = Math.floor(Date.now() / 1000);

    // 发送初始块
    this.sendStreamChunk(res, {
      id: chatId,
      object: 'chat.completion.chunk',
      created,
      model,
      choices: [{
        index: 0,
        delta: { role: 'assistant', content: '' },
        finish_reason: null
      }]
    });

    try {
      const messages = await this.claudeService.query(prompt, {
        sessionId,
        model: claudeModel,
        maxTurns: 1
      });
      
      const { content, toolCalls } = this.messageConverter.convertClaudeMessage(messages);

      // 流式发送内容
      if (content) {
        const chunks = this.chunkContent(content);
        for (const chunk of chunks) {
          this.sendStreamChunk(res, {
            id: chatId,
            object: 'chat.completion.chunk',
            created,
            model,
            choices: [{
              index: 0,
              delta: { content: chunk },
              finish_reason: null
            }]
          });
          
          // 小延迟以模拟流式效果
          await new Promise(resolve => setTimeout(resolve, 20));
        }
      }

      // 发送工具调用
      if (toolCalls && toolCalls.length > 0) {
        for (const toolCall of toolCalls) {
          this.sendStreamChunk(res, {
            id: chatId,
            object: 'chat.completion.chunk',
            created,
            model,
            choices: [{
              index: 0,
              delta: { tool_calls: [toolCall] },
              finish_reason: null
            }]
          });
        }
      }

      // 发送结束块
      this.sendStreamChunk(res, {
        id: chatId,
        object: 'chat.completion.chunk',
        created,
        model,
        choices: [{
          index: 0,
          delta: {},
          finish_reason: toolCalls ? 'tool_calls' : 'stop'
        }]
      });

      res.write('data: [DONE]\n\n');
      res.end();

    } catch (error) {
      console.error('Stream response 处理错误:', error);
      
      // 返回原始错误信息给客户端
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorResponse = {
        error: {
          message: errorMessage,
          type: error?.constructor?.name || 'Error'
        }
      };
      
      res.write(`data: ${JSON.stringify(errorResponse)}\n\n`);
      res.end();
      throw error;
    }
  }

  private chunkContent(content: string, chunkSize: number = 10): string[] {
    const words = content.split(' ');
    const chunks: string[] = [];
    
    for (let i = 0; i < words.length; i += chunkSize) {
      const chunk = words.slice(i, i + chunkSize).join(' ');
      chunks.push(chunk + (i + chunkSize < words.length ? ' ' : ''));
    }
    
    return chunks;
  }

  private sendStreamChunk(res: Response, chunk: any): void {
    res.write(`data: ${JSON.stringify(chunk)}\n\n`);
  }

  private handleModels(req: Request, res: Response): void {
    res.json({
      object: 'list',
      data: [
        {
          id: 'custom-claude-4-sonnet',
          object: 'model',
          created: 1677610602,
          owned_by: 'anthropic',
          permission: [],
          root: 'custom-claude-4-sonnet',
          parent: null
        },
        {
          id: 'custom-claude-4-opus',
          object: 'model',
          created: 1677610602,
          owned_by: 'anthropic',
          permission: [],
          root: 'custom-claude-4-opus',
          parent: null
        }
      ]
    });
  }

  private handleModelDetail(req: Request, res: Response): void {
    const modelId = req.params.model_id;
    
    if (!this.isModelSupported(modelId)) {
      throw new NotFoundError(`Model '${modelId}'`);
    }

    res.json({
      id: modelId,
      object: 'model',
      created: 1677610602,
      owned_by: 'anthropic',
      permission: [],
      root: modelId,
      parent: null
    });
  }

  private async handlePermissionCheck(req: Request, res: Response): Promise<void> {
    const { tool_name, session_id } = req.body;
    const sessionId = session_id || req.headers['x-session-id'] as string;
    
    if (!tool_name || !sessionId) {
      throw new ValidationError('tool_name and session_id are required');
    }

    const result = await this.permissionController.checkPermission(tool_name, sessionId);
    
    res.json({
      allowed: result.allowed,
      reason: result.reason
    });
  }

  private async handleToolGateway(req: Request, res: Response): Promise<void> {
    await this.mcpGateway.handleExpressRoute(req, res);
  }

  private async handleMcpPermission(req: Request, res: Response): Promise<void> {
    await this.mcpServer.handleJsonRpc(req, res, 'permission');
  }

  private async handleMcpGateway(req: Request, res: Response): Promise<void> {
    await this.mcpServer.handleJsonRpc(req, res, 'gateway');
  }

  private isModelSupported(model: string): boolean {
    const supportedModels = [
      'custom-claude-4-sonnet', 
      'custom-claude-4-opus',
      'claude-4-sonnet', 
      'claude-4-opus',
      'claude-sonnet', 
      'claude-opus',
      'anthropic/claude-4-sonnet', 
      'anthropic/claude-4-opus'
    ];
    return supportedModels.includes(model);
  }

  private mapModelName(model: string): string {
    const modelMap: Record<string, string> = {
      'custom-claude-4-sonnet': 'sonnet',
      'custom-claude-4-opus': 'opus',
      'custom-claude-3-haiku': 'haiku',
      'claude-4-sonnet': 'sonnet',
      'claude-4-opus': 'opus',
      'claude-sonnet': 'sonnet',
      'claude-opus': 'opus',
      'claude-haiku': 'haiku',
      'anthropic/claude-4-sonnet': 'sonnet',
      'anthropic/claude-4-opus': 'opus'
    };
    return modelMap[model] || 'sonnet';
  }

  public async start(): Promise<void> {
    // 检查端口是否可用
    const portAvailable = await checkPort(this.port);
    if (!portAvailable) {
      console.log(`⚠️  端口 ${this.port} 被占用，尝试清理...`);
      await killPortProcess(this.port);
      
      // 等待一下让端口释放
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // 再次检查
      const stillOccupied = !(await checkPort(this.port));
      if (stillOccupied) {
        console.error(`❌ 无法释放端口 ${this.port}，请手动检查并结束占用该端口的进程`);
        console.log(`\n💡 你可以使用以下命令查找占用端口的进程：`);
        console.log(`   lsof -i :${this.port}`);
        console.log(`\n或者切换到其他端口：`);
        console.log(`   PORT=3001 npm run dev`);
        process.exit(1);
      }
    }

    const server = this.app.listen(this.port, () => {
      console.log(`
🚀 Claude Code Gateway v2 已启动！

📡 服务地址: http://localhost:${this.port}
🔧 基于 Claude Code SDK
✅ 完全 OpenAI 兼容
🔒 内置权限控制
📊 审计日志已启用
🎯 支持模型: custom-claude-4-sonnet, custom-claude-4-opus

⚙️  环境配置:
   CLAUDE_CODE_MAX_OUTPUT_TOKENS: ${process.env.CLAUDE_CODE_MAX_OUTPUT_TOKENS || '8000'} (默认 8000)
   
   💡 如遇到输出超限错误，可设置更大的值:
      export CLAUDE_CODE_MAX_OUTPUT_TOKENS=16000

📖 测试命令:
   curl -X POST http://localhost:${this.port}/v1/chat/completions \\
     -H "Content-Type: application/json" \\
     -d '{ 
       "model": "custom-claude-4-sonnet", 
       "messages": [{"role": "user", "content": "你好"}] 
     }'

📊 健康检查: http://localhost:${this.port}/health
🔐 权限端点: http://localhost:${this.port}/mcp/permission/check
🛠️ 工具网关: http://localhost:${this.port}/mcp/gateway/:tool

📝 日志位置: ./logs/
🛑 使用 Ctrl+C 优雅关闭服务器
      `);
    });

    // 设置优雅关闭
    setupGracefulShutdown(server, this.port);
  }
}

// 启动服务
if (import.meta.url === `file://${process.argv[1]}`) {
  const gateway = new ClaudeCodeGateway(parseInt(process.env.PORT || '3000'));
  gateway.start();
}

export default ClaudeCodeGateway;
import express, { Request, Response } from 'express';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';

// 导入类型
import { 
  ChatCompletionRequest, 
  ChatCompletionResponse, 
  ChatCompletionChunk,
  ChatMessage,
  ExtendedChatMessage,
  Tool,
  ToolCall,
  ChatCompletionCreateParams 
} from './types/openai-sdk.js';
import { SDKMessage } from './types/claude-code-types.js';

// 导入服务
import { SessionManager } from './services/session-manager.js';
import { PermissionController } from './services/permission-controller.js';
import { MCPGateway } from './services/mcp-gateway.js';
import { MCPAuthServer } from './services/mcp-auth-server.js';
import { MCPGatewayServer } from './services/mcp-gateway-server.js';
import { ToolManager } from './services/tool-manager.js';
import { ClaudeService } from './services/claude-service.js';
import { ToolCallManager } from './services/tool-call-manager.js';
import { MessageTrieCache } from './services/message-trie-cache.js';
import { ClaudeSessionManager } from './services/claude-session-manager.js';
import { logger, LogLevel, LogCategory } from './services/logger.js';
import { ValidationError } from './services/error-handler.js';

// 导入中间件
import { requestLogging, errorHandling, notFoundHandler } from './middleware/logging.js';

// 导入工具和配置
import { ResponseHelper } from './utils/response-helper.js';
import { StreamWriter } from './utils/stream-writer.js';
import { LogHelper } from './utils/log-helper.js';
import { SessionHelper } from './utils/session-helper.js';
import { RequestHandler } from './utils/request-handler.js';
import { ResponseProcessor } from './utils/response-processor.js';
import { RequestValidator } from './utils/request-validator.js';
import { ProcessMonitor } from './utils/process-monitor.js';
import { SDKOutputCapture } from './utils/sdk-output-capture.js';
import { SERVER_CONFIG, MODEL_CONFIG, TIMEOUT_CONFIG, REQUEST_LIMITS, RESPONSE_FORMATS } from './config/constants.js';
import { ConsoleLogger } from './utils/console-logger.js';
import { createLogger } from './utils/unified-logger.js';

class ClaudeCodeGateway {
  private app: express.Application;
  private sessionManager: SessionManager;
  private permissionController: PermissionController;
  private mcpGateway: MCPGateway;
  private mcpAuthServer: MCPAuthServer;
  private mcpGatewayServer: MCPGatewayServer;
  private toolManager: ToolManager;
  private toolCallManager: ToolCallManager;
  private messageTrieCache: MessageTrieCache;
  private claudeService: ClaudeService;
  private claudeSessionManager: ClaudeSessionManager;
  private responseProcessor: ResponseProcessor;
  private port: number;

  constructor(port: number = SERVER_CONFIG.DEFAULT_PORT) {
    this.port = port;
    this.app = express();
    
    // 启用控制台日志记录
    ConsoleLogger.enable();
    
    // 启用进程监控
    ProcessMonitor.enable();
    console.log('✅ 进程监控已启用');
    
    // 启用 SDK 输出捕获
    SDKOutputCapture.interceptSpawn();
    console.log('✅ SDK 输出捕获已启用');
    
    // 初始化服务
    this.sessionManager = new SessionManager();
    this.toolCallManager = new ToolCallManager();
    this.toolManager = new ToolManager();
    this.messageTrieCache = new MessageTrieCache();
    this.permissionController = new PermissionController(this.sessionManager);
    this.mcpGateway = new MCPGateway(this.sessionManager, this.permissionController, this.toolCallManager, this.toolManager);
    this.mcpAuthServer = new MCPAuthServer(this.sessionManager, this.permissionController);
    this.mcpGatewayServer = new MCPGatewayServer(this.sessionManager, this.mcpGateway, this.toolManager);
    this.claudeService = new ClaudeService(this.sessionManager, port, this.toolCallManager);
    this.claudeSessionManager = new ClaudeSessionManager(this.claudeService, this.toolCallManager);
    this.responseProcessor = new ResponseProcessor(this.claudeSessionManager, this.messageTrieCache);
    
    this.setupMiddleware();
    this.setupRoutes();
    this.setupCleanupTimer();
  }

  private setupMiddleware(): void {
    // CORS
    this.app.use(cors({
      origin: true,
      credentials: true
    }));

    // Body parsing
    this.app.use(express.json({ limit: REQUEST_LIMITS.JSON_LIMIT }));
    
    // Request logging
    this.app.use(requestLogging);
  }

  private setupRoutes(): void {
    // OpenAI 兼容端点
    this.app.post('/v1/chat/completions', this.asyncHandler(this.handleChatCompletion.bind(this)));
    this.app.get('/v1/models', this.handleModels.bind(this));
    
    // MCP 端点
    this.app.post('/mcp/permission', this.asyncHandler(this.handleMcpPermission.bind(this)));
    this.app.post('/mcp/gateway', this.asyncHandler(this.handleMcpGateway.bind(this)));
    
    // 权限控制端点
    this.app.post('/mcp/permission/check', this.asyncHandler(this.handlePermissionCheck.bind(this)));
    
    // 工具网关端点
    this.app.post('/mcp/gateway/:tool', this.asyncHandler(this.handleToolGateway.bind(this)));
    
    // 健康检查
    this.app.get('/health', this.handleHealth.bind(this));
    
    // 404 处理
    this.app.use(notFoundHandler);
    
    // 错误处理
    this.app.use(errorHandling);
  }

  private asyncHandler(fn: (req: Request, res: Response, next?: any) => Promise<any>) {
    return (req: Request, res: Response, next: any) => {
      Promise.resolve(fn(req, res, next)).catch(next);
    };
  }

  private handleHealth(req: Request, res: Response): void {
    const health = {
      status: 'ok',
      version: SERVER_CONFIG.VERSION,
      timestamp: new Date().toISOString(),
      services: {
        sessionManager: this.sessionManager.getActiveSessionCount() > -1 ? 'healthy' : 'unhealthy',
        toolManager: this.toolManager.getCacheStats().totalCached > -1 ? 'healthy' : 'unhealthy',
        toolCallManager: this.toolCallManager.getPendingCount() > -1 ? 'healthy' : 'unhealthy',
      },
      stats: {
        activeSessions: this.sessionManager.getActiveSessionCount(),
        pendingToolCalls: this.toolCallManager.getPendingCount(),
        toolCache: this.toolManager.getCacheStats(),
        messageSnapshots: this.messageTrieCache.getStats(),
        claudeSessions: this.claudeSessionManager.getStats()
      }
    };
    
    res.json(health);
  }

  private async handleChatCompletion(
    req: Request<{}, any, ChatCompletionCreateParams>, 
    res: Response
  ): Promise<void> {
    let processedRequest: any;
    
    try {
      // 详细记录请求信息
      console.log('\n========== 新请求 ==========');
      console.log(`时间: ${new Date().toISOString()}`);
      console.log(`User-Agent: ${req.headers['user-agent']}`);
      console.log(`Content-Type: ${req.headers['content-type']}`);
      console.log(`Authorization: ${req.headers.authorization ? '已提供' : '未提供'}`);
      console.log(`请求体:`, JSON.stringify(req.body, null, 2));
      console.log('=============================\n');

      // 处理请求
      processedRequest = RequestHandler.processRequest(req);
      const { requestId, model, messages, tools, stream, abortController } = processedRequest;

      console.log(`[请求处理] requestId: ${requestId}, model: ${model}, stream: ${stream}`);
      console.log(`[请求处理] 消息数: ${messages.length}, 工具数: ${tools?.length || 0}`);

      // 验证请求
      RequestValidator.validate(req.body);
      
      // 解析会话上下文
      const sessionContext = await SessionHelper.resolveSession(
        messages,
        this.messageTrieCache,
        this.toolCallManager,
        this.claudeSessionManager
      );

      // 如果需要继续原会话
      if (sessionContext.shouldContinue) {
        const finalMessages = await this.claudeSessionManager.resumeSession(sessionContext.sessionId);
        if (finalMessages) {
          const response = this.convertToOpenAIResponse(finalMessages, model);
          res.json(response);
          return;
        }
      }

      // 注册会话
      SessionHelper.registerSession(
        sessionContext.sessionId,
        tools,
        this.sessionManager,
        this.toolManager,
        this.permissionController
      );

      // 准备消息
      const customSystemPrompt = SessionHelper.extractSystemPrompt(messages);
      const conversationMessages = SessionHelper.filterConversationMessages(messages);
      const claudeModel = RequestHandler.getClaudeModel(model);
      
      // 记录请求
      LogHelper.logRequest(LogCategory.REQUEST, 'Chat completion request', {
        requestId,
        sessionId: sessionContext.sessionId,
        model,
        hasTools: !!tools && tools.length > 0,
        messageCount: messages.length,
        stream
      });

      // 处理响应
      await this.processResponse({
        res,
        conversationMessages,
        messages,
        model,
        claudeModel,
        sessionId: sessionContext.sessionId,
        requestId,
        abortController,
        customSystemPrompt,
        stream
      });

    } catch (error) {
      console.error('\n========== 请求处理失败 ==========');
      console.error(`请求ID: ${processedRequest?.requestId || 'unknown'}`);
      console.error(`错误类型: ${error?.constructor?.name || 'unknown'}`);
      console.error(`错误消息: ${error instanceof Error ? error.message : String(error)}`);
      console.error(`错误堆栈:`, error instanceof Error ? error.stack : '无堆栈信息');
      console.error('===================================\n');
      
      // 如果是来自 Cline 的请求，提供更详细的错误信息
      if (req.headers['user-agent']?.includes('Cline') || req.headers['user-agent']?.includes('cline')) {
        console.error('[Cline 错误] 检测到来自 Cline 的请求失败');
        console.error('[Cline 错误] 请求详情:', {
          model: req.body?.model,
          messages: req.body?.messages?.length,
          tools: req.body?.tools?.length,
          stream: req.body?.stream
        });
      }
      
      throw error;
    }
  }

  private async processResponse(options: {
    res: Response;
    conversationMessages: ExtendedChatMessage[];
    messages: ExtendedChatMessage[];
    model: string;
    claudeModel: string;
    sessionId: string;
    requestId: string;
    abortController: AbortController;
    customSystemPrompt?: string;
    stream: boolean;
  }): Promise<void> {
    const responseOptions = {
      conversationMessages: options.conversationMessages,
      messages: options.messages,
      model: options.model,
      claudeModel: options.claudeModel,
      sessionId: options.sessionId,
      requestId: options.requestId,
      abortController: options.abortController,
      customSystemPrompt: options.customSystemPrompt
    };

    if (options.stream) {
      await this.responseProcessor.processStream(options.res, responseOptions);
    } else {
      const response = await this.responseProcessor.processNonStream(responseOptions);
      options.res.json(response);
    }
  }


  private convertToOpenAIResponse(claudeMessages: SDKMessage[], model: string): ChatCompletionResponse {
    return this.responseProcessor.convertToResponse(claudeMessages, model) as ChatCompletionResponse;
  }





  private setupCleanupTimer(): void {
    setInterval(() => {
      const stats = {
        pendingToolCalls: this.toolCallManager.getPendingCount(),
        activeSessions: this.sessionManager.getActiveSessionCount(),
        toolCache: this.toolManager.getCacheStats()
      };
      
      console.log('资源使用情况:', stats);
      
      if (stats.pendingToolCalls > TIMEOUT_CONFIG.WARNING_THRESHOLD) {
        console.warn(`警告：待处理工具调用过多 (${stats.pendingToolCalls})`);
      }
    }, TIMEOUT_CONFIG.CLEANUP_INTERVAL);
  }


  private handleModels(req: Request, res: Response): void {
    const models = MODEL_CONFIG.SUPPORTED_MODELS
      .filter(id => id.startsWith('custom-'))
      .map(id => ({
        id,
        object: 'model',
        created: Date.now() / 1000,
        owned_by: 'custom',
        permission: [],
        root: id,
        parent: null
      }));
    
    res.json({ object: 'list', data: models });
  }

  private async handlePermissionCheck(req: Request, res: Response): Promise<void> {
    const { tool_name, session_id } = req.body;
    
    if (!tool_name || !session_id) {
      throw new ValidationError('tool_name and session_id are required');
    }
    
    const result = await this.permissionController.checkPermission(tool_name, session_id);
    res.json(result);
  }

  private async handleToolGateway(req: Request, res: Response): Promise<void> {
    await this.mcpGateway.handleExpressRoute(req, res);
  }

  private async handleMcpPermission(req: Request, res: Response): Promise<void> {
    await this.mcpAuthServer.handleJsonRpc(req, res);
  }

  private async handleMcpGateway(req: Request, res: Response): Promise<void> {
    await this.mcpGatewayServer.handleJsonRpc(req, res);
  }


  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.app.listen(this.port, () => {
        this.printStartupBanner();
        LogHelper.logSystem('Server started', {
          port: this.port,
          environment: process.env.NODE_ENV || 'development'
        });
        resolve();
      });
    });
  }

  private printStartupBanner(): void {
    const supportedModels = MODEL_CONFIG.SUPPORTED_MODELS
      .filter(m => m.startsWith('custom-'))
      .join(', ');
    
    console.log(`
🚀 Claude Code Gateway v${SERVER_CONFIG.VERSION} 已启动！

📡 服务地址: http://localhost:${this.port}
🎯 支持模型: ${supportedModels}
⚙️  MAX_OUTPUT_TOKENS: ${SERVER_CONFIG.MAX_OUTPUT_TOKENS}

📖 测试: curl -X POST http://localhost:${this.port}/v1/chat/completions -H "Content-Type: application/json" -d '{"model": "${MODEL_CONFIG.SUPPORTED_MODELS[0]}", "messages": [{"role": "user", "content": "你好"}]}'
📊 健康: http://localhost:${this.port}/health
    `);
  }

  async stop(): Promise<void> {
    LogHelper.logSystem('Server shutting down');
    process.exit(0);
  }
}

// 处理未捕获的 Promise 拒绝
process.on('unhandledRejection', (reason, promise) => {
  // 特殊处理 Claude Code SDK 的 Error 143
  if (reason instanceof Error && reason.message.includes('Claude Code process exited with code 143')) {
    console.log('[系统] 忽略 Claude Code SDK Error 143 (SIGTERM) - 这是 SDK 的已知问题');
    return;
  }
  
  // 其他未处理的拒绝仍然记录
  console.error('\n========== 未处理的 Promise 拒绝 ==========');
  console.error('原因:', reason);
  console.error('Promise:', promise);
  console.error('==========================================\n');
});

// 优雅关闭
process.on('SIGINT', async () => {
  console.log('\n\n📌 收到关闭信号，正在优雅关闭服务器...');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n\n📌 收到终止信号，正在优雅关闭服务器...');
  process.exit(0);
});

// 导出和启动
const port = parseInt(process.env.PORT || String(SERVER_CONFIG.DEFAULT_PORT));
const gateway = new ClaudeCodeGateway(port);
gateway.start().catch(console.error);

export default ClaudeCodeGateway;
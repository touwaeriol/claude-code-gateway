import express, { Request, Response } from 'express';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';

// 导入类型
import { 
  ChatCompletionRequest, 
  ChatCompletionResponse, 
  ChatCompletionChunk,
  ChatMessage,
  Tool,
  ToolCall 
} from './types/openai';
import { SDKMessage, CLAUDE_BUILTIN_TOOLS } from './types/claude';

// 导入服务
import { SessionManager } from './services/session-manager';
import { MessageConverter } from './services/message-converter';
import { PermissionController } from './services/permission-controller';
import { MCPGateway } from './services/mcp-gateway';
import { MCPAuthServer } from './services/mcp-auth-server';
import { MCPGatewayServer } from './services/mcp-gateway-server';
import { ToolManager } from './services/tool-manager';
import { ClaudeService } from './services/claude-service';
import { ToolCallManager } from './services/tool-call-manager';
import { MessageSnapshotCache } from './services/message-snapshot-cache';
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
  private mcpAuthServer: MCPAuthServer;
  private mcpGatewayServer: MCPGatewayServer;
  private toolManager: ToolManager;
  private toolCallManager: ToolCallManager;
  private messageSnapshotCache: MessageSnapshotCache;
  private claudeService: ClaudeService;
  private port: number;

  constructor(port: number = 3000) {
    this.port = port;
    this.app = express();
    
    // 初始化服务
    this.sessionManager = new SessionManager();
    this.messageConverter = new MessageConverter();
    this.toolCallManager = new ToolCallManager();
    this.toolManager = new ToolManager();
    this.messageSnapshotCache = new MessageSnapshotCache();
    this.permissionController = new PermissionController(this.sessionManager);
    this.mcpGateway = new MCPGateway(this.sessionManager, this.permissionController, this.toolCallManager, this.toolManager);
    this.mcpAuthServer = new MCPAuthServer(this.sessionManager, this.permissionController);
    this.mcpGatewayServer = new MCPGatewayServer(this.sessionManager, this.mcpGateway, this.toolManager);
    this.claudeService = new ClaudeService(this.sessionManager, port, this.toolCallManager);
    
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
    this.app.use(express.json({ limit: '10mb' }));
    
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
      version: '2.0.0',
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
        messageSnapshots: this.messageSnapshotCache.getStats()
      }
    };
    
    res.json(health);
  }

  private async handleChatCompletion(
    req: Request<{}, any, ChatCompletionRequest>, 
    res: Response
  ): Promise<void> {
    const requestId = req.requestId!;
    
    // 创建 AbortController 来支持取消请求
    const abortController = new AbortController();
    
    // 监听客户端断开连接
    req.on('close', () => {
      console.log(`客户端断开连接，取消请求 ${requestId}`);
      abortController.abort(); // 这会触发 Claude Code 进程结束，进而清理工具调用
    });
    
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
      
      // 尝试从消息快照找到会话
      let sessionId = this.messageSnapshotCache.findSessionByMessages(messages);
      
      if (!sessionId) {
        // 新会话或独立请求
        sessionId = uuidv4();
        console.log(`创建新会话: ${sessionId}`);
      } else {
        console.log(`恢复缓存的会话: ${sessionId}`);
        // 命中缓存说明这是工具调用的后续请求
        // 消息中应该包含工具结果
      }

      // 注册会话和工具权限
      if (tools && tools.length > 0) {
        // 在 ToolManager 中注册工具
        this.toolManager.registerSessionTools(sessionId, tools);
        // 注册权限
        this.permissionController.registerSession(sessionId, tools);
      } else {
        // 即使没有工具也创建会话
        this.sessionManager.createSession(sessionId);
      }

      // 提取系统消息作为 customSystemPrompt
      const systemMessages = messages.filter(m => m.role === 'system');
      const customSystemPrompt = systemMessages.length > 0 
        ? systemMessages.map(m => m.content).join('\n') 
        : undefined;

      // 过滤掉系统消息，只传递用户和助手消息
      const conversationMessages = messages.filter(m => m.role !== 'system');
      
      const claudeModel = model.includes('sonnet') ? 'claude-3-5-sonnet-20241022' : 'claude-3-5-sonnet-20241022';
      
      // 构建提示词
      const prompt = this.messageConverter.buildPrompt(conversationMessages);
      
      logger.log(LogLevel.INFO, LogCategory.REQUEST, 'Chat completion request', {
        requestId,
        sessionId,
        model,
        hasTools: !!tools && tools.length > 0,
        messageCount: messages.length,
        stream
      });

      if (stream) {
        await this.handleStreamResponse(
          res, 
          prompt,
          messages, 
          model, 
          claudeModel,
          sessionId,
          requestId,
          abortController,
          customSystemPrompt
        );
      } else {
        // 非流式响应
        const response = await this.handleNonStreamResponse(
          prompt,
          messages,
          model,
          claudeModel,
          sessionId,
          requestId,
          abortController,
          customSystemPrompt
        );
        
        res.json(response);
      }

    } catch (error) {
      // 错误处理由中间件处理
      // Claude Code 进程结束时会自动清理相关工具调用
      throw error;
    }
  }

  private async handleNonStreamResponse(
    prompt: string,
    messages: ChatMessage[],
    model: string,
    claudeModel: string,
    sessionId: string,
    requestId: string,
    abortController: AbortController,
    customSystemPrompt?: string
  ): Promise<ChatCompletionResponse> {
    try {
      // 使用流式处理，以便能够检测工具调用
      const messageStream = this.claudeService.queryWithSDKStream({
        sessionId,
        model: claudeModel,
        prompt,
        abortController,
        customSystemPrompt
      });

      const sdkMessages: SDKMessage[] = [];
      let toolCallDetected = false;
      
      // 处理消息流
      for await (const message of messageStream) {
        sdkMessages.push(message);
        
        // 检查是否有工具调用
        if (message.type === 'assistant' && message.message.content) {
          const content = message.message.content;
          if (Array.isArray(content)) {
            for (const block of content) {
              if (block.type === 'tool_use' && block.name.startsWith('mcp__gateway__')) {
                // 检测到工具调用，立即返回
                toolCallDetected = true;
                
                const toolCall: ToolCall = {
                  id: block.id,
                  type: 'function',
                  function: {
                    name: block.name.replace('mcp__gateway__', ''),
                    arguments: JSON.stringify(block.input || {})
                  }
                };
                
                // 创建消息快照，包含到目前为止的所有消息（使用原始的 OpenAI 格式消息）
                const messagesWithToolCall: ChatMessage[] = [
                  ...messages,
                  {
                    role: 'assistant' as const,
                    content: null,
                    tool_calls: [toolCall]
                  }
                ];
                this.messageSnapshotCache.createSnapshot(messagesWithToolCall, sessionId);
                
                return {
                  id: `chatcmpl-${uuidv4()}`,
                  object: 'chat.completion',
                  created: Math.floor(Date.now() / 1000),
                  model,
                  choices: [{
                    index: 0,
                    message: {
                      role: 'assistant',
                      content: null,
                      tool_calls: [toolCall]
                    },
                    finish_reason: 'tool_calls'
                  }],
                  usage: {
                    prompt_tokens: 0,
                    completion_tokens: 0,
                    total_tokens: 0
                  }
                };
              }
            }
          }
        }
      }
      
      // 没有工具调用，返回完整响应
      return this.convertToOpenAIResponse(sdkMessages, model);
    } catch (error) {
      console.error('Claude Code 执行错误:', error);
      throw error;
    }
  }

  private convertToOpenAIResponse(claudeMessages: SDKMessage[], model: string): ChatCompletionResponse {
    // 提取所有 assistant 消息
    const assistantMessages = claudeMessages.filter(m => m.type === 'assistant');
    
    // 合并内容
    let combinedContent = '';
    const allToolCalls: ToolCall[] = [];
    
    for (let i = 0; i < assistantMessages.length; i++) {
      const assistantMessage = assistantMessages[i];
      
      if (assistantMessage.message.content) {
        if (combinedContent && i > 0) {
          combinedContent += '\n\n'; // 用换行分隔多个响应
        }
        // content 可能是字符串或对象数组
        const content = assistantMessage.message.content;
        if (typeof content === 'string') {
          combinedContent += content;
        } else if (Array.isArray(content)) {
          // 处理结构化内容
          for (const block of content) {
            if (block.type === 'text') {
              combinedContent += block.text;
            }
          }
        }
      }
      
      // 检查工具使用
      const messageContent = assistantMessage.message.content;
      if (Array.isArray(messageContent)) {
        for (const block of messageContent) {
          if (block.type === 'tool_use') {
            // Claude Code SDK 的工具调用格式
            // 检查是否是 MCP 工具调用（以 mcp__ 开头）
            if (block.name.startsWith('mcp__gateway__')) {
              allToolCalls.push({
                id: block.id,
                type: 'function',
                function: {
                  // 移除 mcp__gateway__ 前缀，返回原始工具名
                  name: block.name.replace('mcp__gateway__', ''),
                  arguments: JSON.stringify(block.input || {})
                }
              });
            }
            // 忽略其他工具调用（Claude Code SDK 的内部工具）
          }
        }
      }
    }
    
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
          content: combinedContent || null,
          tool_calls: allToolCalls.length > 0 ? allToolCalls : undefined
        },
        finish_reason: allToolCalls.length > 0 ? 'tool_calls' : 'stop'
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
    messages: ChatMessage[],
    model: string,
    claudeModel: string,
    sessionId: string,
    requestId: string,
    abortController: AbortController,
    customSystemPrompt?: string
  ): Promise<void> {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Request-ID': requestId
    });

    const chatId = `chatcmpl-${uuidv4()}`;
    const created = Math.floor(Date.now() / 1000);
    let hasToolCalls = false;
    let detectedToolCall = false;  // 标记是否检测到工具调用

    try {
      // 获取流式消息
      const messageStream = this.claudeService.queryWithSDKStream({
        sessionId,
        model: claudeModel,
        prompt,
        abortController,
        customSystemPrompt
      });

      let messageIndex = 0;
      
      // 实时处理流式消息
      for await (const message of messageStream) {
        // 处理 assistant 消息
        if (message.type === 'assistant') {
          // 如果这是新的消息（不是第一个），先发送一个分隔
          if (messageIndex > 0) {
            this.sendStreamChunk(res, {
              id: chatId,
              object: 'chat.completion.chunk',
              created,
              model,
              choices: [{
                index: 0,
                delta: { content: '\n\n' },
                finish_reason: null
              }]
            });
          }
          
          // 处理消息内容
          const content = message.message.content;
          
          if (typeof content === 'string' && content.length > 0) {
            // 纯文本内容
            this.sendStreamChunk(res, {
              id: chatId,
              object: 'chat.completion.chunk',
              created,
              model,
              choices: [{
                index: 0,
                delta: { content: content },
                finish_reason: null
              }]
            });
          } else if (Array.isArray(content)) {
            // 结构化内容（包含文本和工具调用）
            for (const block of content) {
              if (block.type === 'text') {
                // 发送文本内容
                this.sendStreamChunk(res, {
                  id: chatId,
                  object: 'chat.completion.chunk',
                  created,
                  model,
                  choices: [{
                    index: 0,
                    delta: { content: block.text },
                    finish_reason: null
                  }]
                });
              } else if (block.type === 'tool_use' && block.name.startsWith('mcp__gateway__')) {
                // 检测到 MCP 工具调用
                detectedToolCall = true;
                
                // 立即结束流式响应，返回工具调用
                const toolCall: ToolCall = {
                  id: block.id,
                  type: 'function',
                  function: {
                    name: block.name.replace('mcp__gateway__', ''),
                    arguments: JSON.stringify(block.input || {})
                  }
                };
                
                // 创建消息快照
                const messagesWithToolCall: ChatMessage[] = [
                  ...messages,
                  {
                    role: 'assistant' as const,
                    content: null,
                    tool_calls: [toolCall]
                  }
                ];
                this.messageSnapshotCache.createSnapshot(messagesWithToolCall, sessionId);
                
                this.sendStreamChunk(res, {
                  id: chatId,
                  object: 'chat.completion.chunk',
                  created,
                  model,
                  choices: [{
                    index: 0,
                    delta: { tool_calls: [toolCall] },
                    finish_reason: 'tool_calls'
                  }]
                });
                
                hasToolCalls = true;
                
                // 立即结束流，让客户端执行工具
                this.sendStreamChunk(res, {
                  id: chatId,
                  object: 'chat.completion.chunk',
                  created,
                  model,
                  choices: [{
                    index: 0,
                    delta: {},
                    finish_reason: 'tool_calls'
                  }]
                });
                
                res.write('data: [DONE]\n\n');
                res.end();
                
                // 退出循环，等待客户端返回工具结果
                return;
              }
            }
          }
          
          messageIndex++;
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
          finish_reason: hasToolCalls ? 'tool_calls' : 'stop'
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

  private sendStreamChunk(res: Response, chunk: any): void {
    res.write(`data: ${JSON.stringify(chunk)}\n\n`);
  }

  /**
   * 检查消息中是否包含工具调用结果
   * @returns 是否包含工具结果
   */
  private hasToolResults(messages: ChatCompletionRequest['messages']): boolean {
    return messages.some(msg => msg.role === 'tool' && msg.tool_call_id);
  }

  /**
   * 设置定期清理定时器
   */
  private setupCleanupTimer(): void {
    // 每分钟检查一次资源使用情况
    setInterval(() => {
      const stats = {
        pendingToolCalls: this.toolCallManager.getPendingCount(),
        activeSessions: this.sessionManager.getActiveSessionCount(),
        toolCache: this.toolManager.getCacheStats()
      };
      
      console.log('资源使用情况:', stats);
      
      // 如果有异常多的待处理工具调用，记录警告
      if (stats.pendingToolCalls > 50) {
        console.warn(`警告：待处理工具调用过多 (${stats.pendingToolCalls})，可能存在资源泄漏`);
      }
    }, 60000); // 每分钟
  }

  private validateChatRequest(request: ChatCompletionRequest): void {
    // 验证模型
    if (request.model && !this.isModelSupported(request.model)) {
      throw new ValidationError(`Model '${request.model}' is not supported`);
    }

    // 验证消息
    if (!request.messages || !Array.isArray(request.messages) || request.messages.length === 0) {
      throw new ValidationError('Messages array is required and must not be empty');
    }

    // 验证工具
    if (request.tools) {
      if (!Array.isArray(request.tools)) {
        throw new ValidationError('Tools must be an array');
      }
      
      for (const tool of request.tools) {
        if (tool.type !== 'function') {
          throw new ValidationError('Only function tools are supported');
        }
        
        if (!tool.function?.name) {
          throw new ValidationError('Tool function name is required');
        }
      }
    }
  }

  private handleModels(req: Request, res: Response): void {
    res.json({
      object: 'list',
      data: [
        {
          id: 'custom-claude-4-sonnet',
          object: 'model',
          created: Date.now() / 1000,
          owned_by: 'custom',
          permission: [],
          root: 'custom-claude-4-sonnet',
          parent: null
        },
        {
          id: 'custom-claude-4-opus',
          object: 'model',
          created: Date.now() / 1000,
          owned_by: 'custom',
          permission: [],
          root: 'custom-claude-4-opus',
          parent: null
        }
      ]
    });
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

  private isModelSupported(model: string): boolean {
    const supportedModels = [
      'custom-claude-4-sonnet', 
      'custom-claude-4-opus',
      'gpt-3.5-turbo',
      'gpt-4',
      'gpt-4-turbo-preview'
    ];
    
    return supportedModels.includes(model) || model.startsWith('custom-');
  }

  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.app.listen(this.port, () => {
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
        
        logger.log(LogLevel.INFO, LogCategory.SYSTEM, 'Server started', {
          port: this.port,
          environment: process.env.NODE_ENV || 'development'
        });
        
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    logger.log(LogLevel.INFO, LogCategory.SYSTEM, 'Server shutting down');
    // 清理资源
    process.exit(0);
  }
}

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
const gateway = new ClaudeCodeGateway(parseInt(process.env.PORT || '3000'));
gateway.start().catch(console.error);

export default ClaudeCodeGateway;
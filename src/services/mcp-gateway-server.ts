import { Request, Response } from 'express';
import { SessionManager } from './session-manager';
import { MCPGateway } from './mcp-gateway';
import { ToolManager } from './tool-manager';

interface JsonRpcRequest {
  jsonrpc: string;
  id?: number | string;
  method: string;
  params?: any;
}

interface JsonRpcResponse {
  jsonrpc: string;
  id: number | string;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

/**
 * MCP 网关服务器
 * 负责处理实际的工具调用
 */
export class MCPGatewayServer {
  constructor(
    private sessionManager: SessionManager,
    private mcpGateway: MCPGateway,
    private toolManager: ToolManager
  ) {}

  /**
   * 处理 JSON-RPC 请求
   */
  async handleJsonRpc(req: Request, res: Response): Promise<void> {
    const request = req.body as JsonRpcRequest;
    const sessionId = req.headers['x-session-id'] as string;

    console.log(`MCP Gateway 请求:`, JSON.stringify(request, null, 2));

    // 处理通知（没有 id 的请求）
    if (!('id' in request)) {
      if (request.method === 'notifications/initialized') {
        res.status(204).end();
        return;
      }
    }

    try {
      let response: JsonRpcResponse;

      switch (request.method) {
        case 'initialize':
          response = this.handleInitialize(request);
          break;
        
        case 'initialized':
        case 'notifications/initialized':
          response = this.handleInitialized(request);
          break;
        
        case 'tools/list':
          response = this.handleToolsList(request, sessionId);
          break;
        
        case 'tools/call':
          response = await this.handleToolCall(request, sessionId);
          break;
        
        default:
          response = {
            jsonrpc: '2.0',
            id: request.id!,
            error: {
              code: -32601,
              message: `Method '${request.method}' not found`
            }
          };
      }

      console.log(`MCP Gateway 响应:`, JSON.stringify(response, null, 2));
      res.json(response);

    } catch (error) {
      console.error(`MCP Gateway 错误:`, error);
      
      res.json({
        jsonrpc: '2.0',
        id: request.id!,
        error: {
          code: -32603,
          message: 'Internal error',
          data: error instanceof Error ? error.message : 'Unknown error'
        }
      });
    }
  }

  /**
   * 处理初始化请求
   */
  private handleInitialize(request: JsonRpcRequest): JsonRpcResponse {
    return {
      jsonrpc: '2.0',
      id: request.id!,
      result: {
        protocolVersion: '2025-06-18',
        capabilities: {
          tools: {}
        },
        serverInfo: {
          name: 'claude-gateway-gateway',
          version: '1.0.0'
        }
      }
    };
  }

  /**
   * 处理初始化完成通知
   */
  private handleInitialized(request: JsonRpcRequest): JsonRpcResponse {
    if (!('id' in request)) {
      return {
        jsonrpc: '2.0',
        id: 0,
        result: null
      };
    }
    
    return {
      jsonrpc: '2.0',
      id: request.id!,
      result: null
    };
  }

  /**
   * 处理工具列表请求
   */
  private handleToolsList(request: JsonRpcRequest, sessionId: string): JsonRpcResponse {
    // 从 ToolManager 获取会话的 MCP 工具定义
    const tools = this.toolManager.getSessionMCPTools(sessionId);
    
    console.log(`MCP Gateway tools/list - sessionId: ${sessionId}, tools count: ${tools.length}`);
    if (tools.length > 0) {
      console.log('工具列表:', tools.map(t => t.name).join(', '));
    }
    
    return {
      jsonrpc: '2.0',
      id: request.id!,
      result: { tools }
    };
  }

  /**
   * 处理工具调用请求
   */
  private async handleToolCall(
    request: JsonRpcRequest,
    sessionId: string
  ): Promise<JsonRpcResponse> {
    const { name, arguments: args } = request.params;
    const toolCallId = String(request.id); // 使用 JSON-RPC 请求 ID

    // 调用 MCPGateway 处理工具调用
    const result = await this.mcpGateway.handleToolCall(name, args, sessionId, toolCallId);
    
    if (result.success) {
      return {
        jsonrpc: '2.0',
        id: request.id!,
        result: {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result.result, null, 2)
            }
          ]
        }
      };
    } else {
      return {
        jsonrpc: '2.0',
        id: request.id!,
        error: {
          code: -32000,
          message: result.error || 'Tool execution failed'
        }
      };
    }
  }
}
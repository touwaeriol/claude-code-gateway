import { Request, Response } from 'express';
import { SessionManager } from './session-manager';
import { PermissionController } from './permission-controller';

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
 * MCP 权限服务器
 * 负责处理工具调用的权限验证
 */
export class MCPAuthServer {
  constructor(
    private sessionManager: SessionManager,
    private permissionController: PermissionController
  ) {}

  /**
   * 处理 JSON-RPC 请求
   */
  async handleJsonRpc(req: Request, res: Response): Promise<void> {
    const request = req.body as JsonRpcRequest;
    const sessionId = req.headers['x-session-id'] as string;

    console.log(`MCP Auth 请求:`, JSON.stringify(request, null, 2));

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
          response = this.handleToolsList(request);
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

      console.log(`MCP Auth 响应:`, JSON.stringify(response, null, 2));
      res.json(response);

    } catch (error) {
      console.error(`MCP Auth 错误:`, error);
      
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
          name: 'claude-gateway-auth',
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
  private handleToolsList(request: JsonRpcRequest): JsonRpcResponse {
    return {
      jsonrpc: '2.0',
      id: request.id!,
      result: {
        tools: [{
          name: 'approval_prompt',
          description: 'Check whether user grants permission for a tool invocation',
          inputSchema: {
            type: 'object',
            properties: {
              tool_name: {
                type: 'string',
                description: 'Name of the tool requesting permission'
              },
              input: {
                type: 'object',
                description: 'Input parameters for the tool',
                additionalProperties: true
              }
            },
            required: ['tool_name', 'input']
          }
        }]
      }
    };
  }

  /**
   * 处理工具调用请求（权限验证）
   */
  private async handleToolCall(
    request: JsonRpcRequest,
    sessionId: string
  ): Promise<JsonRpcResponse> {
    const { name, arguments: args } = request.params;

    if (name === 'approval_prompt') {
      const { tool_name, input } = args;
      console.log(`\n🔐 权限检查请求 - 时间: ${new Date().toISOString()}`);
      console.log(`   工具: ${tool_name}`);
      console.log(`   会话: ${sessionId}`);
      console.log(`工具输入参数:`, input);
      
      const result = await this.permissionController.checkPermission(tool_name, sessionId);
      console.log(`权限检查结果:`, result);
      
      // 按照官方文档格式返回权限结果（必须是JSON字符串）
      const permissionResponse = result.allowed 
        ? {
            behavior: "allow",
            updatedInput: input || {}
          }
        : {
            behavior: "deny", 
            message: result.reason || "Permission denied"
          };
      
      console.log(`权限响应:`, JSON.stringify(permissionResponse));
      
      return {
        jsonrpc: '2.0',
        id: request.id!,
        result: {
          content: [
            {
              type: 'text',
              text: JSON.stringify(permissionResponse)
            }
          ]
        }
      };
    }

    return {
      jsonrpc: '2.0',
      id: request.id!,
      error: {
        code: -32601,
        message: `Tool '${name}' not found`
      }
    };
  }
}
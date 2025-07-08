import { Request, Response } from 'express';
import { SessionManager } from './session-manager';
import { PermissionController } from './permission-controller';
import { MCPGateway } from './mcp-gateway';
import { ToolManager } from './tool-manager';

interface JsonRpcRequest {
  jsonrpc: string;
  id?: number | string;  // id 是可选的，通知类型的请求没有 id
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

export class MCPServer {
  constructor(
    private sessionManager: SessionManager,
    private permissionController: PermissionController,
    private mcpGateway: MCPGateway,
    private toolManager: ToolManager
  ) {}

  /**
   * 处理 MCP JSON-RPC 请求
   */
  async handleJsonRpc(req: Request, res: Response, serverType: 'permission' | 'gateway'): Promise<void> {
    const request = req.body as JsonRpcRequest;
    const sessionId = req.headers['x-session-id'] as string;

    console.log(`MCP ${serverType} 请求:`, JSON.stringify(request, null, 2));

    // 处理通知（没有 id 的请求）
    if (!('id' in request)) {
      if (request.method === 'notifications/initialized') {
        // 对于通知，返回 204 No Content
        res.status(204).end();
        return;
      }
    }

    try {
      let response: JsonRpcResponse;

      switch (request.method) {
        case 'initialize':
          response = await this.handleInitialize(request, serverType);
          break;
        
        case 'initialized':
        case 'notifications/initialized':
          response = this.handleInitialized(request);
          break;
        
        case 'tools/list':
          response = await this.handleToolsList(request, serverType, sessionId);
          break;
        
        case 'tools/call':
          response = await this.handleToolCall(request, serverType, sessionId);
          break;
        
        default:
          response = {
            jsonrpc: '2.0',
            id: request.id!,  // 使用非空断言，因为这里肯定有 id
            error: {
              code: -32601,
              message: `Method '${request.method}' not found`
            }
          };
      }

      console.log(`MCP ${serverType} 响应:`, JSON.stringify(response, null, 2));
      res.json(response);

    } catch (error) {
      console.error(`MCP ${serverType} 错误:`, error);
      
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
  private async handleInitialize(request: JsonRpcRequest, serverType: string): Promise<JsonRpcResponse> {
    return {
      jsonrpc: '2.0',
      id: request.id!,
      result: {
        protocolVersion: '2025-06-18',
        capabilities: {
          tools: serverType === 'gateway' ? {} : {}
        },
        serverInfo: {
          name: `claude-gateway-${serverType}`,
          version: '1.0.0'
        }
      }
    };
  }

  /**
   * 处理初始化完成通知
   */
  private handleInitialized(request: JsonRpcRequest): JsonRpcResponse {
    // 如果是通知（没有 id），不返回响应
    if (!('id' in request)) {
      return {
        jsonrpc: '2.0',
        id: 0, // 这个不会被使用
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
  private async handleToolsList(
    request: JsonRpcRequest, 
    serverType: string,
    sessionId: string
  ): Promise<JsonRpcResponse> {
    if (serverType === 'permission') {
      // 权限服务器只提供一个权限检查工具
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
    } else {
      // 网关服务器提供会话对应的工具列表
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
  }

  /**
   * 处理工具调用请求
   */
  private async handleToolCall(
    request: JsonRpcRequest,
    serverType: string,
    sessionId: string
  ): Promise<JsonRpcResponse> {
    const { name, arguments: args } = request.params;
    const toolCallId = String(request.id); // 使用 JSON-RPC 请求 ID

    if (serverType === 'permission') {
      // 处理权限请求
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
    } else {
      // 处理网关工具调用
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
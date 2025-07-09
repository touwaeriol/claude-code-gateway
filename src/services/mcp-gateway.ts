import { Request, Response } from 'express';
import { SessionManager } from './session-manager.js';
import { PermissionController } from './permission-controller.js';
import { ToolCallManager } from './tool-call-manager.js';
import { ToolManager } from './tool-manager.js';

export interface MCPToolResponse {
  success: boolean;
  result?: any;
  error?: string;
  toolCallId?: string;
}

export class MCPGateway {
  constructor(
    private sessionManager: SessionManager,
    private permissionController: PermissionController,
    private toolCallManager: ToolCallManager,
    private toolManager: ToolManager
  ) {}

  /**
   * 处理工具调用请求
   */
  async handleToolCall(
    toolName: string,
    args: any,
    sessionId: string,
    toolCallId?: string  // 可选参数，如果提供则使用，否则生成
  ): Promise<MCPToolResponse> {
    try {
      // 1. 检查权限
      const fullToolName = `mcp__gateway__${toolName}`;
      const permissionResult = await this.permissionController.checkPermission(
        fullToolName,
        sessionId
      );

      if (!permissionResult.allowed) {
        return {
          success: false,
          error: `Permission denied: ${permissionResult.reason}`
        };
      }

      // 2. 验证工具是否在会话中被允许
      if (!this.toolManager.isToolAllowed(sessionId, toolName)) {
        return {
          success: false,
          error: `Tool '${toolName}' is not allowed in this session`
        };
      }
      
      // 3. 获取会话信息
      const session = this.sessionManager.getSession(sessionId);
      if (!session) {
        return {
          success: false,
          error: 'Session not found or expired'
        };
      }

      // 3. 使用提供的ID或生成新的工具调用ID
      const finalToolCallId = toolCallId || `call_${this.generateId()}`;
      
      // 4. 注册工具调用并等待客户端执行
      console.log(`MCP Gateway: 注册工具调用 ${finalToolCallId}，等待客户端执行`);
      
      // 发出事件通知 API 有工具调用待处理
      // API 应该检测到这个事件并提前返回
      this.toolCallManager.emit('tool-call-pending', {
        toolCallId: finalToolCallId,
        toolName,
        sessionId,
        arguments: args
      });
      
      try {
        // 这会阻塞直到客户端返回结果或超时
        const result = await this.toolCallManager.registerToolCall(
          finalToolCallId,
          sessionId,
          toolName
        );
        
        console.log(`MCP Gateway: 收到工具调用结果 ${finalToolCallId}:`, result);
        
        return {
          success: true,
          result,
          toolCallId: finalToolCallId
        };
      } catch (error) {
        console.error(`MCP Gateway: 工具调用失败 ${finalToolCallId}:`, error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Tool execution failed',
          toolCallId: finalToolCallId
        };
      }

    } catch (error) {
      console.error(`Tool execution error: ${toolName}`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Tool execution failed'
      };
    }
  }


  /**
   * 生成唯一 ID
   */
  private generateId(): string {
    return Math.random().toString(36).substring(2, 11);
  }

  /**
   * Express 路由处理器
   */
  async handleExpressRoute(req: Request, res: Response): Promise<void> {
    const { tool } = req.params;
    const sessionId = req.headers['x-session-id'] as string || req.body.session_id;
    const args = req.body;

    if (!sessionId) {
      res.status(400).json({
        error: 'Missing session ID'
      });
      return;
    }

    const result = await this.handleToolCall(tool, args, sessionId);

    if (result.success) {
      res.json({
        result: result.result,
        toolCallId: result.toolCallId
      });
    } else {
      res.status(400).json({
        error: result.error
      });
    }
  }
}
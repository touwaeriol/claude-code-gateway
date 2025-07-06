import { Request, Response } from 'express';
import { SessionManager } from './session-manager';
import { PermissionController } from './permission-controller';

export interface MCPToolRequest {
  tool: string;
  arguments: any;
  sessionId: string;
}

export interface MCPToolResponse {
  success: boolean;
  result?: any;
  error?: string;
  toolCallId?: string;
}

export class MCPGateway {
  constructor(
    private sessionManager: SessionManager,
    private permissionController: PermissionController
  ) {}

  /**
   * 处理工具调用请求
   */
  async handleToolCall(
    toolName: string,
    args: any,
    sessionId: string
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

      // 2. 获取会话信息
      const session = this.sessionManager.getSession(sessionId);
      if (!session) {
        return {
          success: false,
          error: 'Session not found or expired'
        };
      }

      // 3. 执行工具（这里实现具体的工具逻辑）
      const result = await this.executeTool(toolName, args);

      return {
        success: true,
        result,
        toolCallId: `call_${this.generateId()}`
      };

    } catch (error) {
      console.error(`Tool execution error: ${toolName}`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Tool execution failed'
      };
    }
  }

  /**
   * 执行具体的工具
   */
  private async executeTool(toolName: string, args: any): Promise<any> {
    // 这里可以根据工具名称执行不同的逻辑
    switch (toolName) {
      case 'calculate':
        return this.executeCalculate(args);
      
      case 'search':
        return this.executeSearch(args);
      
      case 'get_weather':
        return this.executeGetWeather(args);
      
      default:
        // 对于未实现的工具，返回模拟结果
        return {
          message: `Tool ${toolName} executed with args: ${JSON.stringify(args)}`,
          timestamp: new Date().toISOString()
        };
    }
  }

  /**
   * 计算工具实现
   */
  private executeCalculate(args: any): any {
    const { expression } = args;
    if (!expression) {
      throw new Error('Missing required parameter: expression');
    }

    try {
      // 安全的数学表达式计算
      // 在生产环境中应该使用更安全的方法
      const result = this.safeEval(expression);
      return {
        expression,
        result,
        type: typeof result
      };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Calculation error';
      throw new Error(`Failed to calculate: ${errMsg}`);
    }
  }

  /**
   * 搜索工具实现
   */
  private executeSearch(args: any): any {
    const { query, limit = 5 } = args;
    if (!query) {
      throw new Error('Missing required parameter: query');
    }

    // 模拟搜索结果
    return {
      query,
      results: [
        {
          title: `Result 1 for "${query}"`,
          snippet: `This is a sample result for your search query: ${query}`,
          url: `https://example.com/1`
        },
        {
          title: `Result 2 for "${query}"`,
          snippet: `Another relevant result for: ${query}`,
          url: `https://example.com/2`
        }
      ].slice(0, limit),
      total: 2
    };
  }

  /**
   * 天气工具实现
   */
  private executeGetWeather(args: any): any {
    const { location, units = 'celsius' } = args;
    if (!location) {
      throw new Error('Missing required parameter: location');
    }

    // 模拟天气数据
    const temp = Math.floor(Math.random() * 30) + 10;
    return {
      location,
      temperature: units === 'fahrenheit' ? (temp * 9/5) + 32 : temp,
      units,
      conditions: ['sunny', 'cloudy', 'rainy'][Math.floor(Math.random() * 3)],
      humidity: Math.floor(Math.random() * 40) + 40,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 安全的表达式计算
   */
  private safeEval(expression: string): number {
    // 只允许数字、运算符和括号
    const cleaned = expression.replace(/[^0-9+\-*/().\s]/g, '');
    if (cleaned !== expression) {
      throw new Error('Invalid characters in expression');
    }

    // 使用 Function 构造器而不是 eval
    try {
      const func = new Function('return ' + cleaned);
      const result = func();
      
      if (typeof result !== 'number' || !isFinite(result)) {
        throw new Error('Invalid calculation result');
      }
      
      return result;
    } catch (error) {
      throw new Error('Failed to evaluate expression');
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
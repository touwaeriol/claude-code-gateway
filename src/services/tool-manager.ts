import { Tool } from '../types/openai';

export interface ToolMapping {
  openaiName: string;
  mcpName: string;
  description: string;
  handler?: (args: any) => Promise<any>;
}

export class ToolManager {
  private toolMappings: Map<string, ToolMapping> = new Map();

  constructor() {
    this.registerDefaultTools();
  }

  /**
   * 注册默认工具
   */
  private registerDefaultTools(): void {
    // 计算工具
    this.registerTool({
      openaiName: 'calculate',
      mcpName: 'mcp__gateway__calculate',
      description: '执行数学计算'
    });

    // 搜索工具
    this.registerTool({
      openaiName: 'search',
      mcpName: 'mcp__gateway__search',
      description: '搜索信息'
    });

    // 天气工具
    this.registerTool({
      openaiName: 'get_weather',
      mcpName: 'mcp__gateway__get_weather',
      description: '获取天气信息'
    });
  }

  /**
   * 注册工具
   */
  registerTool(mapping: ToolMapping): void {
    this.toolMappings.set(mapping.openaiName, mapping);
  }

  /**
   * 获取 MCP 工具名称
   */
  getMCPToolName(openaiName: string): string {
    const mapping = this.toolMappings.get(openaiName);
    return mapping?.mcpName || `mcp__gateway__${openaiName}`;
  }

  /**
   * 获取 OpenAI 工具名称
   */
  getOpenAIToolName(mcpName: string): string {
    // 移除 mcp__gateway__ 前缀
    const defaultName = mcpName.replace(/^mcp__gateway__/, '');
    
    // 查找映射
    for (const [openaiName, mapping] of this.toolMappings.entries()) {
      if (mapping.mcpName === mcpName) {
        return openaiName;
      }
    }
    
    return defaultName;
  }

  /**
   * 验证工具参数
   */
  validateToolArgs(toolName: string, args: any, toolDefinition?: Tool): { valid: boolean; error?: string } {
    if (!toolDefinition?.function?.parameters) {
      return { valid: true };
    }

    const params = toolDefinition.function.parameters;
    
    // 检查必需参数
    if (params.required && Array.isArray(params.required)) {
      for (const required of params.required) {
        if (!(required in args)) {
          return { 
            valid: false, 
            error: `Missing required parameter: ${required}` 
          };
        }
      }
    }

    // 检查参数类型（简化版本）
    if (params.properties) {
      for (const [key, schema] of Object.entries(params.properties)) {
        if (key in args && schema && typeof schema === 'object' && 'type' in schema) {
          const expectedType = schema.type;
          const actualType = typeof args[key];
          
          if (expectedType === 'string' && actualType !== 'string') {
            return { 
              valid: false, 
              error: `Parameter ${key} must be a string` 
            };
          }
          
          if (expectedType === 'number' && actualType !== 'number') {
            return { 
              valid: false, 
              error: `Parameter ${key} must be a number` 
            };
          }
        }
      }
    }

    return { valid: true };
  }

  /**
   * 格式化工具调用结果
   */
  formatToolResult(result: any, toolName: string): string {
    if (typeof result === 'string') {
      return result;
    }

    if (result === null || result === undefined) {
      return `Tool ${toolName} completed successfully`;
    }

    try {
      return JSON.stringify(result, null, 2);
    } catch {
      return String(result);
    }
  }
}
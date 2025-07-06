/**
 * MCP 配置管理
 */

export interface MCPServerConfig {
  type: 'http' | 'stdio' | 'sse';
  transport?: 'http' | 'stdio' | 'sse'; // 向后兼容
  url?: string;
  command?: string;
  args?: string[];
  headers?: Record<string, string>;
}

export class MCPConfigManager {
  /**
   * 生成会话特定的 MCP 配置
   */
  static generateSessionConfig(sessionId: string, port: number = 3000): Record<string, MCPServerConfig> {
    return {
      // 权限控制 MCP
      permission: {
        type: 'http',
        transport: 'http',
        url: `http://localhost:${port}/mcp/permission`,
        headers: {
          'X-Session-ID': sessionId
        }
      },
      // 工具网关 MCP
      gateway: {
        type: 'http',
        transport: 'http',
        url: `http://localhost:${port}/mcp/gateway`,
        headers: {
          'X-Session-ID': sessionId
        }
      }
    };
  }

  /**
   * 创建 MCP 配置文件内容
   */
  static createConfigContent(sessionId: string, port?: number): string {
    const config = {
      mcpServers: this.generateSessionConfig(sessionId, port)
    };
    return JSON.stringify(config, null, 2);
  }
}
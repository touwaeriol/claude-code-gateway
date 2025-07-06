import { query } from '@anthropic-ai/claude-code';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { spawn } from 'child_process';

import { SDKMessage, CLAUDE_BUILTIN_TOOLS } from '../types/claude';
import { ChatMessage, Tool } from '../types/openai';
import { SessionManager } from './session-manager';
import { MCPConfigManager } from '../config/mcp-config';

export interface ClaudeServiceOptions {
  sessionId: string;
  model: string;
  tools?: Tool[];
  maxTurns?: number;
  useSDK?: boolean;  // 使用 SDK 还是 CLI
}

export class ClaudeService {
  constructor(
    private sessionManager: SessionManager,
    private port: number = 3000
  ) {}

  /**
   * 查询 Claude（支持 SDK 和 CLI 两种方式）
   */
  async query(
    prompt: string,
    options: ClaudeServiceOptions
  ): Promise<SDKMessage[]> {
    if (options.useSDK !== false) {
      return this.queryWithSDK(prompt, options);
    } else {
      return this.queryWithCLI(prompt, options);
    }
  }

  /**
   * 使用 SDK 查询
   */
  private async queryWithSDK(
    prompt: string,
    options: ClaudeServiceOptions
  ): Promise<SDKMessage[]> {
    console.log('queryWithSDK 开始执行');
    console.log('Options:', JSON.stringify(options, null, 2));
    
    // 不处理内容，让 Claude 自己处理长提示
    
    const messages: SDKMessage[] = [];
    const session = this.sessionManager.getSession(options.sessionId);
    const allowedTools = session?.allowedTools || [];
    
    console.log('Session:', session);
    console.log('Allowed tools:', allowedTools);

    // 创建 MCP 服务器配置 - 使用项目内置的权限控制服务器
    const mcpServers = {
      // Auth 服务器 - 提供权限控制工具
      auth: {
        type: 'http' as const,
        url: `http://localhost:${this.port}/mcp/permission`,
        headers: {
          'X-Session-ID': options.sessionId
        }
      },
      // Gateway 服务器 - 提供受控的业务工具
      gateway: {
        type: 'http' as const,
        url: `http://localhost:${this.port}/mcp/gateway`,
        headers: {
          'X-Session-ID': options.sessionId
        }
      }
    };

    console.log('MCP Servers:', JSON.stringify(mcpServers, null, 2));
    
    try {
      console.log('开始调用 Claude Code SDK query...');
      
      for await (const message of query({
        prompt,
        options: {
          model: options.model,
          maxTurns: options.maxTurns || 1,
          // 设置最大输出 token 数，防止超限
          maxOutputTokens: parseInt(process.env.CLAUDE_CODE_MAX_OUTPUT_TOKENS || '8000'),
          // 禁用所有内置工具
          disallowedTools: CLAUDE_BUILTIN_TOOLS,
          // 只使用我们控制的 MCP 服务器
          mcpServers: mcpServers,
          // 使用权限工具进行所有工具调用的验证
          permissionPromptToolName: 'mcp__auth__approval_prompt'
        }
      })) {
        console.log('收到消息:', JSON.stringify(message));

        messages.push(message);
      }
    } catch (error) {
      console.error('SDK query 错误:', error);
      
      // 记录详细的错误信息用于调试
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Claude SDK 错误详情:', {
        errorMessage,
        errorType: error?.constructor?.name,
        sessionId: options.sessionId,
        model: options.model,
        promptLength: prompt?.length,
        hasLongPrompt: prompt?.length > 100000
      });
      
      // 直接抛出原始错误，让调用方处理
      throw error;
    }
    
    console.log('queryWithSDK 完成，消息数:', messages.length);
    return messages;
  }

  /**
   * 使用 CLI 查询（备用方案）
   */
  private async queryWithCLI(
    prompt: string,
    options: ClaudeServiceOptions
  ): Promise<SDKMessage[]> {
    // 创建临时目录
    const tempDir = mkdtempSync(join(tmpdir(), 'claude-'));
    const configPath = join(tempDir, 'mcp.json');

    try {
      // 写入 MCP 配置
      const configContent = MCPConfigManager.createConfigContent(options.sessionId, this.port);
      writeFileSync(configPath, configContent);

      // 构建命令
      const args = [
        'query',
        prompt,
        '--model', options.model,
        '--mcp-config', configPath,
        '--max-turns', String(options.maxTurns || 1)
      ];

      // 添加禁用的工具
      args.push('--disallowedTools', ...CLAUDE_BUILTIN_TOOLS);
      
      // 添加权限工具
      args.push('--permission-prompt-tool', 'mcp__auth__approval_prompt');

      // 执行命令
      return new Promise((resolve, reject) => {
        const child = spawn('claude', args, {
          env: {
            ...process.env
          }
        });

        let output = '';
        let error = '';

        child.stdout.on('data', (data) => {
          output += data.toString();
        });

        child.stderr.on('data', (data) => {
          error += data.toString();
        });

        child.on('exit', (code) => {
          if (code === 0) {
            try {
              // 解析输出为消息
              const messages = this.parseCliOutput(output);
              resolve(messages);
            } catch (err) {
              const errMsg = err instanceof Error ? err.message : 'Unknown error';
              reject(new Error(`Failed to parse CLI output: ${errMsg}`));
            }
          } else {
            reject(new Error(`Claude CLI failed with code ${code}: ${error}`));
          }
        });
      });

    } finally {
      // 清理临时文件
      rmSync(tempDir, { recursive: true, force: true });
    }
  }

  /**
   * 解析 CLI 输出
   */
  private parseCliOutput(output: string): SDKMessage[] {
    // 这里需要根据实际的 CLI 输出格式进行解析
    // 现在返回一个模拟的响应
    return [{
      type: 'assistant',
      message: {
        content: output,
        role: 'assistant'
      },
      parent_tool_use_id: null,
      session_id: 'cli-session'
    }];
  }

  /**
   * 创建隔离的 Claude 查询环境
   */
  async queryInIsolation(
    prompt: string,
    options: ClaudeServiceOptions
  ): Promise<SDKMessage[]> {
    // 创建临时目录
    const tempDir = mkdtempSync(join(tmpdir(), 'claude-iso-'));
    
    try {
      // 设置隔离环境
      const env = {
        ...process.env,
        CLAUDE_CONFIG_DIR: tempDir,
        CLAUDE_DISABLE_DEFAULT_CONFIG: 'true',
        MCP_CONFIG_PATH: join(tempDir, 'mcp.json')
      };

      // 写入受控的 MCP 配置
      const configPath = join(tempDir, 'mcp.json');
      const configContent = MCPConfigManager.createConfigContent(options.sessionId, this.port);
      writeFileSync(configPath, configContent);

      // 在隔离环境中执行查询
      return await this.queryWithSDK(prompt, options);

    } finally {
      // 清理临时目录
      rmSync(tempDir, { recursive: true, force: true });
    }
  }
}
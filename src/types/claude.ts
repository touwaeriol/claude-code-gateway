// Claude Code SDK 类型定义
import type { Options as SDKOptions, SDKMessage, SDKUserMessage, SDKAssistantMessage } from '@anthropic-ai/claude-code';

// 重新导出 SDK 类型
export type { SDKMessage, SDKOptions, SDKUserMessage, SDKAssistantMessage };
export { query } from '@anthropic-ai/claude-code';

// Claude 内置工具列表
export const CLAUDE_BUILTIN_TOOLS = [
  'Bash',
  'Edit',
  'Write',
  'Read',
  'Search',
  'Grep',
  'Glob',
  'LS',
  'TodoRead',
  'TodoWrite',
  'NotebookRead',
  'NotebookEdit',
  'WebFetch',
  'WebSearch',
  'MultiEdit',
  'Task',
  'exit_plan_mode'
] as const;

export type ClaudeBuiltinTool = typeof CLAUDE_BUILTIN_TOOLS[number];
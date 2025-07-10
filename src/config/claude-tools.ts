/**
 * Claude 内置工具列表
 */
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
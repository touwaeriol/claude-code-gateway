/**
 * 应用常量配置
 */

// 服务器配置
export const SERVER_CONFIG = {
    DEFAULT_PORT: 3000,
    VERSION: '2.0.0',
    MAX_OUTPUT_TOKENS: parseInt(process.env.CLAUDE_CODE_MAX_OUTPUT_TOKENS || '8000')
} as const;

// 模型配置
export const MODEL_CONFIG = {
    // 客户端模型 -> Claude Code SDK 模型映射
    MODEL_MAPPING: {
        'custom-claude-4-sonnet': 'sonnet',
        'custom-claude-4-opus': 'opus'
    } as const,
    // 动态获取支持的模型列表
    get SUPPORTED_MODELS() {
        return Object.keys(this.MODEL_MAPPING);
    }
} as const;

// 超时配置
export const TIMEOUT_CONFIG = {
    SESSION_TIMEOUT: 30 * 60 * 1000,  // 30分钟
    CLEANUP_INTERVAL: 60000,          // 1分钟
    WARNING_THRESHOLD: 50             // 待处理工具调用警告阈值
} as const;

// 请求限制
export const REQUEST_LIMITS = {
    JSON_LIMIT: '10mb'
    // MAX_TURNS 不设置，使用 SDK 默认行为（不限制轮数）
} as const;

// MCP 配置
export const MCP_CONFIG = {
    AUTH_PREFIX: 'mcp__auth__',
    GATEWAY_PREFIX: 'mcp__gateway__',
    PERMISSION_TOOL: 'mcp__auth__approval_prompt'
} as const;

// 响应格式
export const RESPONSE_FORMATS = {
    OPENAI_COMPLETION: 'chat.completion',
    OPENAI_CHUNK: 'chat.completion.chunk',
    STREAM_DONE: '[DONE]'
} as const;

// 日志配置
export const LOG_CONFIG = {
    // 全局日志级别
    LOG_LEVEL: (process.env.LOG_LEVEL || 'info') as 'debug' | 'info' | 'warn' | 'error',
    // 各类日志级别（已废弃，使用统一日志系统）
    ACCESS_LOG_LEVEL: (process.env.ACCESS_LOG_LEVEL || 'info') as 'debug' | 'info',
    CLAUDE_SDK_LOG_LEVEL: (process.env.CLAUDE_SDK_LOG_LEVEL || 'info') as 'debug' | 'info',
} as const;
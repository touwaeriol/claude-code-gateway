/**
 * 串行工具调用配置常量
 */
export const SEQUENTIAL_TOOL_CONFIG = {
    // Claude SDK 停止原因
    STOP_REASONS: {
        TOOL_USE: 'tool_use',
        END_TURN: 'end_turn',
        MAX_TOKENS: 'max_tokens',
        STOP_SEQUENCE: 'stop_sequence'
    },
    
    // 消息角色
    MESSAGE_ROLES: {
        ASSISTANT: 'assistant',
        TOOL: 'tool',
        USER: 'user'
    },
    
    // 状态缓存前缀
    CACHE_PREFIXES: {
        SEQUENTIAL_STATE: 'sequential_'
    },
    
    // 默认响应消息
    DEFAULT_MESSAGES: {
        TOOLS_COMPLETED: '所有工具调用已完成。',
        CLIENT_DISCONNECTED: '客户端断开'
    },
    
    // 完成原因
    FINISH_REASONS: {
        TOOL_CALLS: 'tool_calls',
        STOP: 'stop',
        MAX_TOKENS: 'max_tokens',
        STOP_SEQUENCE: 'stop_sequence'
    },
    
    // SDK 消息类型
    SDK_MESSAGE_TYPES: {
        USER: 'user',
        ASSISTANT: 'assistant',
        PROGRESS: 'progress',
        RESULT: 'result',
        ERROR: 'error',
        SYSTEM: 'system'
    }
} as const;

/**
 * 串行工具调用相关的类型定义
 */
export type SequentialToolStopReason = typeof SEQUENTIAL_TOOL_CONFIG.STOP_REASONS[keyof typeof SEQUENTIAL_TOOL_CONFIG.STOP_REASONS];
export type SequentialToolMessageRole = typeof SEQUENTIAL_TOOL_CONFIG.MESSAGE_ROLES[keyof typeof SEQUENTIAL_TOOL_CONFIG.MESSAGE_ROLES];
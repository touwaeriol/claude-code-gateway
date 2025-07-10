/**
 * Claude Code SDK 类型定义和扩展
 * 
 * 这是手动编写的类型定义文件，用于：
 * 1. 扩展 @anthropic-ai/claude-code 模块的类型定义
 * 2. 提供缺失的类型导出
 * 3. 定义辅助类型和常量
 * 
 * 注意：这不是自动生成的文件，应该被版本控制。
 */

declare module '@anthropic-ai/claude-code' {
    // ========== 基础类型定义 ==========
    
    export interface Options {
        prompt: string | AsyncIterable<SDKUserMessage>;
        options?: {
            abortController?: AbortController;
            allowedTools?: string[];
            appendSystemPrompt?: string;
            customSystemPrompt?: string;
            cwd?: string;
            disallowedTools?: string[];
            env?: Record<string, string>;
            keepAlive?: number;
            maxTurns?: number;
            mcpServers?: Record<string, any>;
            model?: string;
            permissionPromptToolName?: string;
            projectDirectory?: string;
        };
    }

    export interface SDKMessage {
        type: 'user' | 'assistant' | 'progress';
        message?: MessageParam | ClaudeMessage;
        parent_tool_use_id?: string | null; // 经常为 null，标记为可选
        session_id: string;
        // 可选的元数据字段 - 根据实际使用情况调整
        parentUuid?: string | null;
        isSidechain?: boolean;
        userType?: string;
        cwd?: string;
        version?: string;
        uuid?: string;
        timestamp?: string;
        requestId?: string;
        toolUseResult?: any;
        // progress 类型特有的字段
        progress?: string;
    }

    export interface SDKUserMessage extends SDKMessage {
        type: 'user';
        message: MessageParam;
    }

    export interface SDKAssistantMessage extends SDKMessage {
        type: 'assistant';
        message: ClaudeMessage;
    }

    export interface SDKProgressMessage extends SDKMessage {
        type: 'progress';
        progress: string;
    }

    // Claude 实际返回的消息格式
    export interface ClaudeMessage {
        id: string;
        type: 'message';
        role: 'assistant';
        model: string;
        content: ContentBlock[];
        // 根据日志分析，这些字段经常为 null，标记为可选
        stop_reason?: 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use' | null;
        stop_sequence?: string | null;
        usage: {
            input_tokens: number;
            output_tokens: number;
            cache_creation_input_tokens?: number;
            cache_read_input_tokens?: number;
        };
    }

    export type ContentBlock = 
        | TextBlock 
        | ToolUseBlock;

    export interface TextBlock {
        type: 'text';
        text: string;
    }

    export interface ToolUseBlock {
        type: 'tool_use';
        id: string;
        name: string;
        input: any;
    }

    // 工具结果块
    export interface ToolResultBlock {
        type: 'tool_result';
        tool_use_id: string;
        content: string | ContentBlock[];
    }

    // 错误消息类型
    export interface SDKErrorMessage {
        type: 'error';
        error: {
            message: string;
            code?: string;
            details?: any;
        };
        session_id: string;
        uuid?: string;
        timestamp?: string;
    }

    // 系统消息类型（如会话开始/结束）
    export interface SDKSystemMessage {
        type: 'system';
        subtype?: 'init';
        event?: 'session_start' | 'session_end' | 'tool_permission_request' | 'tool_permission_response';
        data?: any;
        session_id: string;
        uuid?: string;
        timestamp?: string;
        cwd?: string;
        tools?: string[];
        mcp_servers?: Array<{ name: string; status: string }>;
        model?: string;
    }
    
    // 结果消息类型（标志 SDK 完成当前轮次）
    export interface SDKResultMessage {
        type: 'result';
        subtype: 'success' | 'error_max_turns' | 'error_during_execution';
        is_error: boolean;
        duration_ms: number;
        duration_api_ms?: number;
        num_turns?: number;
        result?: string; // 只有 subtype 为 'success' 时才有
        session_id: string;
        total_cost_usd?: number;
        usage?: {
            input_tokens: number;
            output_tokens: number;
            cache_creation_input_tokens?: number;
            cache_read_input_tokens?: number;
            server_tool_use?: any;
            service_tier?: string;
        };
        error?: {
            message: string;
            code?: string;
        };
    }

    // 扩展的完整消息类型
    export type SDKFullMessage = SDKMessage | SDKErrorMessage | SDKSystemMessage | SDKResultMessage;

    export function query(options: Options): AsyncGenerator<SDKMessage>;

    // ========== 类型扩展 ==========
    
    // 扩展 MessageParam 类型以支持我们的自定义格式
    export interface MessageParam {
        role: 'user' | 'assistant';
        content: string | any[];
    }

    // 辅助类型：检查消息是否包含工具调用
    export type HasToolUse<T extends ClaudeMessage> = T['content'] extends readonly any[] 
        ? T['content'][number] extends ToolUseBlock 
            ? true 
            : false 
        : false;

    // 辅助类型：提取工具调用
    export type ExtractToolUses<T extends ClaudeMessage> = Extract<
        T['content'][number], 
        ToolUseBlock
    >[];

    // 辅助函数类型定义
    export interface SDKHelpers {
        isUserMessage(msg: SDKMessage): msg is SDKUserMessage;
        isAssistantMessage(msg: SDKMessage): msg is SDKAssistantMessage;
        hasToolUse(msg: ClaudeMessage): boolean;
        extractToolUses(msg: ClaudeMessage): ToolUseBlock[];
        extractTextContent(msg: ClaudeMessage): string;
    }
}

// ========== 导出类型 ==========

/**
 * Claude 内置工具类型
 * 注意：实际的常量数组定义在 /src/config/claude-tools.ts
 * 这里只提供类型定义，避免在 .d.ts 文件中定义运行时值
 */
export type ClaudeBuiltinTool = 
    | 'Bash'
    | 'Edit'
    | 'Write'
    | 'Read'
    | 'Search'
    | 'Grep'
    | 'Glob'
    | 'LS'
    | 'TodoRead'
    | 'TodoWrite'
    | 'NotebookRead'
    | 'NotebookEdit'
    | 'WebFetch'
    | 'WebSearch'
    | 'MultiEdit'
    | 'Task'
    | 'exit_plan_mode';

// 从 @anthropic-ai/claude-code 重新导出常用类型
export type {
    Options as SDKOptions,
    SDKMessage,
    SDKUserMessage,
    SDKAssistantMessage,
    SDKProgressMessage,
    ClaudeMessage,
    ContentBlock,
    TextBlock,
    ToolUseBlock,
    ToolResultBlock,
    SDKErrorMessage,
    SDKSystemMessage,
    SDKResultMessage,
    SDKFullMessage,
    MessageParam,
    HasToolUse,
    ExtractToolUses,
    SDKHelpers
} from '@anthropic-ai/claude-code';
import { v4 as uuidv4 } from 'uuid';
import { ExtendedChatMessage as ChatMessage, Tool } from '../types/openai-sdk.js';
import { SessionManager } from '../services/session-manager.js';
import { PermissionController } from '../services/permission-controller.js';
import { ToolManager } from '../services/tool-manager.js';
import { ToolCallManager } from '../services/tool-call-manager.js';
import { MessageTrieCache } from '../services/message-trie-cache.js';
import { ClaudeSessionManager } from '../services/claude-session-manager.js';

export interface SessionContext {
    sessionId: string;
    isNewSession: boolean;
    shouldContinue: boolean;
}

export interface MessageAnalysis {
    hasNewMessages: boolean;
    newMessages: ChatMessage[];
    hasToolResults: boolean;
    hasUserMessages: boolean;
}

/**
 * 会话管理辅助工具
 */
export class SessionHelper {
    /**
     * 解析会话上下文
     */
    static async resolveSession(
        messages: ChatMessage[],
        messageTrieCache: MessageTrieCache,
        toolCallManager: ToolCallManager,
        claudeSessionManager: ClaudeSessionManager
    ): Promise<SessionContext> {
        const snapshotResult = messageTrieCache.findSessionByMessagesWithDetails(messages);
        
        if (!snapshotResult || !snapshotResult.sessionId) {
            // 新会话
            const sessionId = uuidv4();
            console.log(`创建新会话: ${sessionId}`);
            return { sessionId, isNewSession: true, shouldContinue: false };
        }

        const sessionId = snapshotResult.sessionId;
        const analysis = this.analyzeMessages(messages, snapshotResult.matchedLength);
        
        console.log(`找到缓存会话: ${sessionId}, 匹配长度: ${snapshotResult.matchedLength}`);

        if (analysis.hasToolResults && !analysis.hasUserMessages) {
            // 只有工具结果，继续原会话
            console.log('只有工具结果，继续原会话');
            
            // 转发工具结果
            this.forwardToolResults(analysis.newMessages, toolCallManager);
            
            return { sessionId, isNewSession: false, shouldContinue: true };
        } else if (analysis.hasUserMessages) {
            // 有新的用户消息，停止原会话并创建新会话
            console.log('检测到新的用户消息，停止原会话并开始新会话');
            claudeSessionManager.abortSession(sessionId);
            
            const newSessionId = uuidv4();
            console.log(`创建新会话: ${newSessionId}`);
            return { sessionId: newSessionId, isNewSession: true, shouldContinue: false };
        }

        return { sessionId, isNewSession: false, shouldContinue: false };
    }

    /**
     * 分析消息
     */
    static analyzeMessages(messages: ChatMessage[], matchedLength: number): MessageAnalysis {
        const hasNewMessages = messages.length > matchedLength;
        const newMessages = hasNewMessages ? messages.slice(matchedLength) : [];
        const hasToolResults = newMessages.some(msg => msg.role === 'tool');
        const hasUserMessages = newMessages.some(msg => msg.role === 'user');

        return {
            hasNewMessages,
            newMessages,
            hasToolResults,
            hasUserMessages
        };
    }

    /**
     * 转发工具结果
     */
    static forwardToolResults(messages: ChatMessage[], toolCallManager: ToolCallManager): void {
        const toolMessages = messages.filter(msg => msg.role === 'tool' && msg.tool_call_id);
        for (const toolMsg of toolMessages) {
            toolCallManager.resolveToolCall(
                toolMsg.tool_call_id!,
                toolMsg.content
            );
        }
    }

    /**
     * 注册会话
     */
    static registerSession(
        sessionId: string,
        tools: Tool[] | undefined,
        sessionManager: SessionManager,
        toolManager: ToolManager,
        permissionController: PermissionController
    ): void {
        if (tools && tools.length > 0) {
            toolManager.registerSessionTools(sessionId, tools);
            permissionController.registerSession(sessionId, tools);
        } else {
            sessionManager.createSession(sessionId);
        }
    }

    /**
     * 提取系统提示词
     */
    static extractSystemPrompt(messages: ChatMessage[]): string | undefined {
        const systemMessages = messages.filter(m => m.role === 'system');
        return systemMessages.length > 0 
            ? systemMessages.map(m => m.content).join('\n') 
            : undefined;
    }

    /**
     * 过滤对话消息
     */
    static filterConversationMessages(messages: ChatMessage[]): ChatMessage[] {
        return messages.filter(m => m.role !== 'system');
    }
}
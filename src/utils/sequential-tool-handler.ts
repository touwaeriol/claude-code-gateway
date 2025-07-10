import { ExtendedChatMessage as ChatMessage, ToolCall } from '../types/openai-sdk.js';
import { MessageTrieCache } from '../services/message-trie-cache.js';
import { ClaudeSessionManager } from '../services/claude-session-manager.js';
import { SEQUENTIAL_TOOL_CONFIG } from '../config/sequential-tool-config.js';
import { logger } from './unified-logger.js';

/**
 * 串行工具调用处理器
 * 用于处理不支持批量工具调用的客户端
 */
export class SequentialToolHandler {
    constructor(
        private messageTrieCache: MessageTrieCache,
        private claudeSessionManager: ClaudeSessionManager
    ) {}

    /**
     * 检查是否需要串行处理
     * @param toolCalls 工具调用数组
     * @param isSequentialClient 客户端是否只支持串行处理
     */
    needsSequentialProcessing(toolCalls: ToolCall[], isSequentialClient: boolean): boolean {
        return toolCalls.length > 1 && isSequentialClient;
    }

    /**
     * 处理串行工具调用
     * @param sessionId 会话ID
     * @param messages 当前消息列表
     * @param allToolCalls 所有工具调用
     * @param processedCount 已处理的工具调用数量
     * @returns 下一个需要处理的工具调用
     */
    async processSequentialToolCall(
        sessionId: string,
        messages: ChatMessage[],
        allToolCalls: ToolCall[],
        processedCount: number = 0
    ): Promise<{
        nextToolCall: ToolCall | null;
        updatedMessages: ChatMessage[];
        isComplete: boolean;
    }> {
        logger.info(`[SequentialToolHandler] 处理串行工具调用: ${processedCount}/${allToolCalls.length}`);

        // 如果所有工具调用都已处理完成
        if (processedCount >= allToolCalls.length) {
            return {
                nextToolCall: null,
                updatedMessages: messages,
                isComplete: true
            };
        }

        const nextToolCall = allToolCalls[processedCount];
        
        // 创建包含当前工具调用的消息快照
        const updatedMessages = this.insertToolCallIntoMessages(
            messages,
            nextToolCall,
            processedCount
        );

        // 保存当前状态到缓存
        await this.saveSequentialState(sessionId, {
            messages: updatedMessages,
            allToolCalls,
            processedCount: processedCount + 1,
            currentToolCall: nextToolCall
        });

        return {
            nextToolCall,
            updatedMessages,
            isComplete: false
        };
    }

    /**
     * 处理工具调用结果
     * @param sessionId 会话ID
     * @param messages 包含工具结果的消息列表
     * @returns 处理结果
     */
    async handleToolResult(
        sessionId: string,
        messages: ChatMessage[]
    ): Promise<{
        nextToolCall: ToolCall | null;
        updatedMessages: ChatMessage[];
        isComplete: boolean;
        shouldContinueSession: boolean;
    }> {
        // 从缓存中获取串行处理状态
        const state = await this.getSequentialState(sessionId);
        if (!state) {
            logger.warn(`[SequentialToolHandler] 未找到会话 ${sessionId} 的串行处理状态`);
            return {
                nextToolCall: null,
                updatedMessages: messages,
                isComplete: true,
                shouldContinueSession: false
            };
        }

        // 检查是否还有待处理的工具调用
        if (state.processedCount >= state.allToolCalls.length) {
            logger.info(`[SequentialToolHandler] 所有工具调用已完成: ${state.processedCount}/${state.allToolCalls.length}`);
            
            // 清理串行处理状态
            await this.clearSequentialState(sessionId);
            
            return {
                nextToolCall: null,
                updatedMessages: messages,
                isComplete: true,
                shouldContinueSession: true // 需要继续会话获取最终响应
            };
        }

        // 获取下一个工具调用
        const nextToolCall = state.allToolCalls[state.processedCount];
        
        // 更新消息列表，插入下一个工具调用
        const updatedMessages = this.insertToolCallIntoMessages(
            messages,
            nextToolCall,
            state.processedCount
        );

        // 更新状态
        await this.saveSequentialState(sessionId, {
            ...state,
            messages: updatedMessages,
            processedCount: state.processedCount + 1,
            currentToolCall: nextToolCall
        });

        return {
            nextToolCall,
            updatedMessages,
            isComplete: false,
            shouldContinueSession: false
        };
    }

    /**
     * 将工具调用插入到正确的消息位置
     */
    private insertToolCallIntoMessages(
        messages: ChatMessage[],
        toolCall: ToolCall,
        position: number
    ): ChatMessage[] {
        // 找到最后一个 assistant 消息的位置
        let lastAssistantIndex = -1;
        for (let i = messages.length - 1; i >= 0; i--) {
            if (messages[i].role === SEQUENTIAL_TOOL_CONFIG.MESSAGE_ROLES.ASSISTANT) {
                lastAssistantIndex = i;
                break;
            }
        }

        const result = [...messages];
        
        if (lastAssistantIndex !== -1) {
            // 如果这是第一个工具调用，更新现有的 assistant 消息
            if (position === 0) {
                result[lastAssistantIndex] = {
                    ...result[lastAssistantIndex],
                    tool_calls: [toolCall],
                    content: null
                };
            } else {
                // 如果不是第一个，在适当位置插入新的 assistant 消息
                const insertIndex = lastAssistantIndex + 1;
                result.splice(insertIndex, 0, {
                    role: SEQUENTIAL_TOOL_CONFIG.MESSAGE_ROLES.ASSISTANT,
                    content: null,
                    tool_calls: [toolCall]
                });
            }
        } else {
            // 如果没有找到 assistant 消息，在末尾添加
            result.push({
                role: SEQUENTIAL_TOOL_CONFIG.MESSAGE_ROLES.ASSISTANT,
                content: null,
                tool_calls: [toolCall]
            });
        }

        return result;
    }

    /**
     * 保存串行处理状态
     */
    private async saveSequentialState(sessionId: string, state: SequentialState): Promise<void> {
        const stateKey = `${SEQUENTIAL_TOOL_CONFIG.CACHE_PREFIXES.SEQUENTIAL_STATE}${sessionId}`;
        // 这里应该保存到缓存或数据库
        // 暂时使用内存存储
        (global as any).sequentialStates = (global as any).sequentialStates || new Map();
        (global as any).sequentialStates.set(stateKey, state);
        
        logger.debug(`[SequentialToolHandler] 保存串行状态: ${stateKey}`, {
            processedCount: state.processedCount,
            totalCount: state.allToolCalls.length
        });
    }

    /**
     * 获取串行处理状态
     */
    private async getSequentialState(sessionId: string): Promise<SequentialState | null> {
        const stateKey = `${SEQUENTIAL_TOOL_CONFIG.CACHE_PREFIXES.SEQUENTIAL_STATE}${sessionId}`;
        const states = (global as any).sequentialStates;
        return states?.get(stateKey) || null;
    }

    /**
     * 清理串行处理状态
     */
    private async clearSequentialState(sessionId: string): Promise<void> {
        const stateKey = `${SEQUENTIAL_TOOL_CONFIG.CACHE_PREFIXES.SEQUENTIAL_STATE}${sessionId}`;
        const states = (global as any).sequentialStates;
        if (states) {
            states.delete(stateKey);
        }
        logger.debug(`[SequentialToolHandler] 清理串行状态: ${stateKey}`);
    }
}

/**
 * 串行处理状态
 */
interface SequentialState {
    messages: ChatMessage[];
    allToolCalls: ToolCall[];
    processedCount: number;
    currentToolCall: ToolCall;
}
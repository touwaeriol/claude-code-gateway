import crypto from 'crypto';
import { ExtendedChatMessage as ChatMessage } from '../types/openai-sdk.js';

/**
 * 使用 Trie 树优化的消息缓存
 * 专门为前缀匹配场景设计
 */
export class MessageTrieCache {
  private root: TrieNode;
  private readonly ttl = 5 * 60 * 1000; // 5分钟过期
  
  constructor() {
    this.root = new TrieNode();
    
    // 定期清理过期节点
    setInterval(() => this.cleanup(), 60000);
  }
  
  /**
   * 创建消息快照
   * 时间复杂度: O(n) where n = messages.length
   */
  createSnapshot(messages: ChatMessage[], sessionId: string): void {
    let current = this.root;
    
    // 为每条消息创建节点
    for (let i = 0; i < messages.length; i++) {
      const messageKey = this.getMessageKey(messages[i]);
      
      if (!current.children.has(messageKey)) {
        current.children.set(messageKey, new TrieNode());
      }
      
      current = current.children.get(messageKey)!;
      current.messageIndex = i;
      current.originalMessage = messages[i];
    }
    
    // 在最后一个节点存储会话信息
    current.sessionId = sessionId;
    current.timestamp = Date.now();
    current.messageCount = messages.length;
    current.isEndNode = true;
    
    console.log(`创建消息快照 - Trie树路径长度: ${messages.length}, sessionId: ${sessionId}`);
  }
  
  /**
   * 查找匹配的会话（返回详细信息）
   * 时间复杂度: O(n) where n = messages.length
   */
  findSessionByMessagesWithDetails(messages: ChatMessage[]): {
    sessionId: string;
    matchedLength: number;
  } | null {
    let current = this.root;
    let lastValidMatch: {
      sessionId: string;
      matchedLength: number;
      node: TrieNode;
    } | null = null;
    
    // 遍历消息，查找最长匹配
    for (let i = 0; i < messages.length; i++) {
      const messageKey = this.getMessageKey(messages[i]);
      
      if (!current.children.has(messageKey)) {
        // 没有更多匹配
        break;
      }
      
      current = current.children.get(messageKey)!;
      
      // 如果当前节点是结束节点且未过期
      if (current.isEndNode && current.sessionId && this.isNodeValid(current)) {
        lastValidMatch = {
          sessionId: current.sessionId,
          matchedLength: current.messageCount,
          node: current
        };
      }
    }
    
    if (lastValidMatch) {
      console.log(`Trie树匹配成功 - 匹配长度: ${lastValidMatch.matchedLength}, sessionId: ${lastValidMatch.sessionId}`);
      
      // 分析新增的消息
      const newMessages = messages.slice(lastValidMatch.matchedLength);
      const hasToolResults = newMessages.some(msg => msg.role === 'tool');
      const hasUserMessages = newMessages.some(msg => msg.role === 'user');
      
      // 只有在确认要使用这个会话时才删除缓存
      if (hasToolResults && !hasUserMessages) {
        // 标记节点为已使用（但不立即删除，以支持多次查询）
        lastValidMatch.node.used = true;
        lastValidMatch.node.lastUsed = Date.now();
      }
      
      return {
        sessionId: lastValidMatch.sessionId,
        matchedLength: lastValidMatch.matchedLength
      };
    }
    
    console.log('Trie树未找到匹配的会话快照');
    return null;
  }
  
  /**
   * 查找匹配的会话（简化接口）
   */
  findSessionByMessages(messages: ChatMessage[]): string | null {
    const result = this.findSessionByMessagesWithDetails(messages);
    return result ? result.sessionId : null;
  }
  
  /**
   * 删除特定会话的缓存
   */
  removeSnapshot(sessionId: string): void {
    const removeFromNode = (node: TrieNode): boolean => {
      if (node.sessionId === sessionId) {
        node.sessionId = null;
        node.isEndNode = false;
        return true;
      }
      
      for (const [key, child] of node.children) {
        if (removeFromNode(child)) {
          // 如果子节点空了，可以删除
          if (child.children.size === 0 && !child.isEndNode) {
            node.children.delete(key);
          }
          return true;
        }
      }
      
      return false;
    };
    
    removeFromNode(this.root);
  }
  
  /**
   * 生成消息的唯一键
   */
  private getMessageKey(message: ChatMessage): string {
    // 创建消息的规范化表示
    const normalized = {
      role: message.role,
      content: message.content,
      // 工具调用需要特殊处理
      tool_calls: message.tool_calls ? message.tool_calls.map((tc: any) => ({
        id: tc.id,
        type: tc.type,
        function: {
          name: tc.function.name,
          arguments: tc.function.arguments
        }
      })) : undefined,
      tool_call_id: message.tool_call_id
    };
    
    // 使用 SHA256 生成稳定的键
    return crypto
      .createHash('sha256')
      .update(JSON.stringify(normalized))
      .digest('hex')
      .substring(0, 16);
  }
  
  /**
   * 检查节点是否有效
   */
  private isNodeValid(node: TrieNode): boolean {
    // 检查是否过期
    if (Date.now() - node.timestamp > this.ttl) {
      return false;
    }
    
    // 检查是否已被使用（可配置是否允许重复使用）
    if (node.used) {
      // 如果最近使用过（1分钟内），可能是重试，允许再次使用
      return Date.now() - node.lastUsed < 60000;
    }
    
    return true;
  }
  
  /**
   * 清理过期和无用节点
   */
  private cleanup(): void {
    const now = Date.now();
    let cleaned = 0;
    
    const cleanupNode = (node: TrieNode): boolean => {
      // 清理过期的会话信息
      if (node.sessionId && now - node.timestamp >= this.ttl) {
        node.sessionId = null;
        node.isEndNode = false;
        cleaned++;
      }
      
      // 递归清理子节点
      const keysToDelete: string[] = [];
      for (const [key, child] of node.children) {
        const shouldDelete = cleanupNode(child);
        if (shouldDelete && child.children.size === 0 && !child.isEndNode) {
          keysToDelete.push(key);
        }
      }
      
      // 删除空子节点
      for (const key of keysToDelete) {
        node.children.delete(key);
      }
      
      // 返回此节点是否可以被删除
      return node.children.size === 0 && !node.isEndNode;
    };
    
    cleanupNode(this.root);
    
    if (cleaned > 0) {
      console.log(`Trie树清理了 ${cleaned} 个过期的消息快照`);
    }
  }
  
  /**
   * 获取缓存统计信息
   */
  getStats(): {
    total: number;
    expired: number;
    used: number;
    nodes: number;
    depth: number;
  } {
    const now = Date.now();
    let total = 0;
    let expired = 0;
    let used = 0;
    let nodes = 0;
    let maxDepth = 0;
    
    const traverse = (node: TrieNode, depth: number) => {
      nodes++;
      maxDepth = Math.max(maxDepth, depth);
      
      if (node.isEndNode && node.sessionId) {
        total++;
        if (now - node.timestamp >= this.ttl) {
          expired++;
        }
        if (node.used) {
          used++;
        }
      }
      
      for (const child of node.children.values()) {
        traverse(child, depth + 1);
      }
    };
    
    traverse(this.root, 0);
    
    return {
      total,
      expired,
      used,
      nodes,
      depth: maxDepth
    };
  }
  
  /**
   * 调试方法：打印 Trie 树结构
   */
  debugPrint(): void {
    const print = (node: TrieNode, prefix: string, depth: number) => {
      const indent = '  '.repeat(depth);
      
      if (node.isEndNode) {
        console.log(`${indent}[END] sessionId: ${node.sessionId}, messages: ${node.messageCount}`);
      }
      
      for (const [key, child] of node.children) {
        console.log(`${indent}├─ ${key.substring(0, 8)}...`);
        print(child, prefix + key, depth + 1);
      }
    };
    
    console.log('=== Trie Tree Structure ===');
    print(this.root, '', 0);
  }
}

/**
 * Trie 树节点
 */
class TrieNode {
  children = new Map<string, TrieNode>();
  sessionId: string | null = null;
  timestamp: number = 0;
  messageCount: number = 0;
  messageIndex: number = -1;
  originalMessage: ChatMessage | null = null;
  isEndNode: boolean = false;
  used: boolean = false;
  lastUsed: number = 0;
}
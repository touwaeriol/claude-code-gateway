import crypto from 'crypto';
import { ChatMessage } from '../types/openai';

interface MessageSnapshot {
  messages: ChatMessage[];
  sessionId: string;
  timestamp: number;
  hash: string;
}

export class MessageSnapshotCache {
  private cache = new Map<string, MessageSnapshot>();
  private readonly ttl = 5 * 60 * 1000; // 5分钟过期
  
  constructor() {
    // 定期清理过期缓存
    setInterval(() => this.cleanup(), 60000); // 每分钟清理一次
  }
  
  /**
   * 创建消息快照并缓存
   */
  createSnapshot(messages: ChatMessage[], sessionId: string): string {
    const hash = this.generateHash(messages);
    
    const snapshot: MessageSnapshot = {
      messages: [...messages], // 深拷贝消息
      sessionId,
      timestamp: Date.now(),
      hash
    };
    
    this.cache.set(hash, snapshot);
    console.log(`创建消息快照 - hash: ${hash}, sessionId: ${sessionId}, 消息数: ${messages.length}`);
    
    return hash;
  }
  
  /**
   * 通过消息前缀匹配查找会话
   */
  findSessionByMessages(messages: ChatMessage[]): string | null {
    const now = Date.now();
    
    // 遍历所有缓存的快照
    for (const [hash, snapshot] of this.cache.entries()) {
      // 检查是否过期
      if (now - snapshot.timestamp > this.ttl) {
        continue;
      }
      
      // 检查消息是否前缀匹配
      if (this.isPrefixMatch(snapshot.messages, messages)) {
        console.log(`找到匹配的会话 - hash: ${hash}, sessionId: ${snapshot.sessionId}`);
        
        // 找到匹配后删除缓存（一次性使用）
        this.cache.delete(hash);
        
        return snapshot.sessionId;
      }
    }
    
    console.log('未找到匹配的会话快照');
    return null;
  }
  
  /**
   * 检查 cached 是否是 current 的前缀
   */
  private isPrefixMatch(cached: ChatMessage[], current: ChatMessage[]): boolean {
    // 当前消息必须包含所有缓存的消息
    if (current.length < cached.length) {
      return false;
    }
    
    // 逐个比较消息
    for (let i = 0; i < cached.length; i++) {
      if (!this.isMessageEqual(cached[i], current[i])) {
        return false;
      }
    }
    
    // 额外验证：下一条消息应该是工具结果
    if (current.length > cached.length) {
      const nextMessage = current[cached.length];
      // 第一条新消息应该是工具结果
      if (nextMessage.role !== 'tool') {
        console.log('下一条消息不是工具结果，跳过匹配');
        return false;
      }
    }
    
    return true;
  }
  
  /**
   * 比较两条消息是否相等
   */
  private isMessageEqual(msg1: ChatMessage, msg2: ChatMessage): boolean {
    // 比较基本属性
    if (msg1.role !== msg2.role) {
      return false;
    }
    
    // 比较内容
    if (msg1.content !== msg2.content) {
      return false;
    }
    
    // 比较工具调用
    if (msg1.role === 'assistant') {
      // 工具调用数量必须相同
      const calls1 = msg1.tool_calls || [];
      const calls2 = msg2.tool_calls || [];
      
      if (calls1.length !== calls2.length) {
        return false;
      }
      
      // 比较每个工具调用
      for (let i = 0; i < calls1.length; i++) {
        if (calls1[i].id !== calls2[i].id ||
            calls1[i].function.name !== calls2[i].function.name ||
            calls1[i].function.arguments !== calls2[i].function.arguments) {
          return false;
        }
      }
    }
    
    // 比较工具结果
    if (msg1.role === 'tool') {
      if (msg1.tool_call_id !== msg2.tool_call_id) {
        return false;
      }
    }
    
    return true;
  }
  
  /**
   * 生成消息列表的哈希
   */
  private generateHash(messages: ChatMessage[]): string {
    const content = JSON.stringify(messages.map(msg => ({
      role: msg.role,
      content: msg.content,
      tool_calls: msg.tool_calls,
      tool_call_id: msg.tool_call_id
    })));
    
    return crypto
      .createHash('sha256')
      .update(content)
      .digest('hex')
      .substring(0, 16); // 取前16位
  }
  
  /**
   * 清理过期缓存
   */
  private cleanup(): void {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [hash, snapshot] of this.cache.entries()) {
      if (now - snapshot.timestamp > this.ttl) {
        this.cache.delete(hash);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      console.log(`清理了 ${cleaned} 个过期的消息快照`);
    }
  }
  
  /**
   * 获取缓存统计信息
   */
  getStats(): { total: number; expired: number } {
    const now = Date.now();
    let expired = 0;
    
    for (const snapshot of this.cache.values()) {
      if (now - snapshot.timestamp > this.ttl) {
        expired++;
      }
    }
    
    return {
      total: this.cache.size,
      expired
    };
  }
}
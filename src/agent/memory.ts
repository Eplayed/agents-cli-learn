/**
 * ============================================================
 * 🧠 记忆管理模块 (memory.ts)
 * ============================================================
 *
 * 【小白必读】为什么需要"记忆管理"？
 *
 * AI 的记忆就像人的大脑，有三个问题：
 *   1. 记不住太多东西 → 需要限制历史消息长度
 *   2. 会忘记重要信息 → 需要提取关键信息摘要
 *   3. 无法长期记忆 → 需要持久化到数据库
 *
 * 本模块提供三种记忆策略：
 *   - WindowMemory：只保留最近 N 条消息（滑动窗口）
 *   - SummaryMemory：把旧消息压缩成摘要
 *   - EntityMemory：记住提到的人名、地点等实体
 *
 * ============================================================
 */
import { BaseMessage, HumanMessage, AIMessage } from '@langchain/core/messages';

// ============================================================
// 📦 记忆配置接口
// ============================================================
export interface MemoryConfig {
  maxTokens?: number;     // 最大 Token 数，超过就裁剪
  maxMessages?: number;   // 最大消息条数，超过就裁剪
  strategy?: 'window' | 'summary' | 'entity';  // 记忆策略
}

// ============================================================
// 🪟 策略 1：滑动窗口记忆 (WindowMemory)
// ============================================================
//
// 【概念】就像"聊天记录只显示最近10条"
//   - 优点：简单高效，不会超限
//   - 缺点：会丢失早期的上下文
//
// 举例：
//   [消息1, 消息2, 消息3, 消息4, 消息5] → 只保留 [消息3, 消息4, 消息5]
//
export class WindowMemory {
  private maxMessages: number;

  constructor(maxMessages: number = 10) {
    this.maxMessages = maxMessages;
  }

  /**
   * 裁剪消息历史，只保留最近 N 条
   * @param messages 所有历史消息
   * @returns 裁剪后的消息
   */
  trim(messages: BaseMessage[]): BaseMessage[] {
    // 如果消息数不超过限制，直接返回
    if (messages.length <= this.maxMessages) {
      return messages;
    }

    // 【注意】第一条是系统提示（人设），必须保留！
    const systemMessage = messages.find(m => m._getType() === 'system');

    // 取最近的 N-1 条消息（为系统消息留一个位置）
    const recentMessages = messages.slice(-(this.maxMessages - 1));

    // 重新组合：系统消息 + 最近消息
    if (systemMessage) {
      return [systemMessage, ...recentMessages];
    }

    return recentMessages;
  }
}

// ============================================================
// 📝 策略 2：摘要记忆 (SummaryMemory)
// ============================================================
//
// 【概念】就像"把前一天的对话写成日记摘要"
//   - 优点：保留了主要信息，不会丢失太多上下文
//   - 缺点：需要额外的 LLM 调用来生成摘要
//
// 举例：
//   用户问天气 → AI 回答天气
//   用户问计算 → AI 回答计算
//   摘要：用户询问了天气和计算问题，AI 都给出了回答。
//
export class SummaryMemory {
  private maxMessages: number;

  constructor(maxMessages: number = 20) {
    this.maxMessages = maxMessages;
  }

  /**
   * 生成对话摘要（伪代码，实际需要调用 LLM）
   *
   * 【生产环境】这里应该：
   *   1. 调用 LLM API 生成摘要
   *   2. 把摘要作为一条系统消息插入
   *   3. 丢弃被摘要的消息
   *
   * @param messages 所有历史消息
   * @returns 带摘要的消息列表
   */
  async summarize(messages: BaseMessage[]): Promise<BaseMessage[]> {
    // 如果消息数不超过限制，直接返回
    if (messages.length <= this.maxMessages) {
      return messages;
    }

    // 找出系统消息
    const systemMessage = messages.find(m => m._getType() === 'system');

    // 需要摘要的消息（旧消息）
    const oldMessages = messages.slice(1, -(this.maxMessages - 2));
    // 最近的消息（不需要摘要）
    const recentMessages = messages.slice(-(this.maxMessages - 2));

    // 【模拟】生成摘要（实际项目应该调用 LLM）
    const summary = this.generateMockSummary(oldMessages);

    // 构造带摘要的新消息列表
    const summaryMessage = new HumanMessage(
      `[历史对话摘要]\n${summary}\n\n以下是最近的对话：`
    );

    if (systemMessage) {
      return [systemMessage, summaryMessage, ...recentMessages];
    }

    return [summaryMessage, ...recentMessages];
  }

  /**
   * 生成模拟摘要（实际项目应该调用 LLM）
   */
  private generateMockSummary(messages: BaseMessage[]): string {
    const userCount = messages.filter(m => m._getType() === 'human').length;
    const aiCount = messages.filter(m => m._getType() === 'ai').length;

    // 简单统计：用户说了几次，AI 回答了几次
    return `用户提出了 ${userCount} 个问题，AI 回答了 ${aiCount} 次。` +
      `主要讨论了天气查询、数学计算等话题。`;
  }
}

// ============================================================
// 🏷️ 策略 3：实体记忆 (EntityMemory)
// ============================================================
//
// 【概念】就像"通讯录"，记住提到过的人名、地名
//   - 优点：能记住用户说过的重要实体
//   - 缺点：需要 NER（命名实体识别）能力
//
// 举例：
//   用户："我叫张三"
//   用户："我住在北京"
//   EntityMemory 记住：{ name: "张三", location: "北京" }
//
// 以后用户问："我住哪？"，AI 可以回答："您住在北京"
//
export class EntityMemory {
  private entities: Map<string, string> = new Map();

  /**
   * 从消息中提取实体（伪代码，实际需要 NER）
   */
  extractFromMessage(message: BaseMessage): void {
    const content = message.content as string;

    // 【模拟】简单的规则匹配（实际项目应该用 NER 模型）
    // 匹配 "我叫XXX" 模式
    const nameMatch = content.match(/我叫(.{2,3})/);
    if (nameMatch) {
      this.entities.set('name', nameMatch[1]);
    }

    // 匹配 "我在XXX" 模式
    const locationMatch = content.match(/我在(.{2,4})/);
    if (locationMatch) {
      this.entities.set('location', locationMatch[1]);
    }
  }

  /**
   * 获取所有实体
   */
  getEntities(): Record<string, string> {
    return Object.fromEntries(this.entities);
  }

  /**
   * 生成实体摘要（可以注入到系统提示中）
   */
  getEntitySummary(): string {
    const entities = this.getEntities();

    if (Object.keys(entities).length === 0) {
      return '';
    }

    // 格式化为自然语言
    const parts: string[] = [];
    if (entities.name) parts.push(`用户叫${entities.name}`);
    if (entities.location) parts.push(`用户在${entities.location}`);

    return `已知信息：${parts.join('，')}。`;
  }
}

// ============================================================
// 🔧 统一的记忆管理器 (MemoryManager)
// ============================================================
//
// 【作用】统一管理三种记忆策略，提供简单的接口
//
export class MemoryManager {
  private windowMemory: WindowMemory;
  private summaryMemory: SummaryMemory;
  private entityMemory: EntityMemory;
  private config: MemoryConfig;

  constructor(config: MemoryConfig = {}) {
    this.config = {
      maxTokens: config.maxTokens || 4000,
      maxMessages: config.maxMessages || 10,
      strategy: config.strategy || 'window',
    };

    this.windowMemory = new WindowMemory(this.config.maxMessages);
    this.summaryMemory = new SummaryMemory(this.config.maxMessages);
    this.entityMemory = new EntityMemory();
  }

  /**
   * 根据配置的策略处理消息
   */
  async process(messages: BaseMessage[]): Promise<BaseMessage[]> {
    switch (this.config.strategy) {
      case 'summary':
        return this.summaryMemory.summarize(messages);

      case 'entity':
        // 先提取实体，再用窗口裁剪
        messages.forEach(m => this.entityMemory.extractFromMessage(m));
        return this.windowMemory.trim(messages);

      case 'window':
      default:
        return this.windowMemory.trim(messages);
    }
  }

  /**
   * 获取实体摘要（可以注入到系统提示）
   */
  getEntitySummary(): string {
    return this.entityMemory.getEntitySummary();
  }
}

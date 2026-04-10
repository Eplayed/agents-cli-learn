/**
 * ============================================================
 * ⏸️ 中断点模块 (interrupt.ts)
 * ============================================================
 *
 * 【小白必读】什么是"中断点"？
 *
 * 想象你在玩游戏，遇到 BOSS 战前会提示：
 *   "即将进入 BOSS 战，是否继续？[是/否]"
 *
 * 中断点就是这样的"确认环节"：
 *   - AI 想发送邮件 → 中断，等待人工确认
 *   - AI 想删除文件 → 中断，等待人工批准
 *   - AI 想转账 → 中断，等待人工授权
 *
 * 【核心概念】
 *   1. interrupt_before：执行某节点前，先暂停
 *   2. interrupt_after：执行某节点后，暂停
 *   3. 恢复执行：人工确认后，继续执行
 *
 * ============================================================
 */
import { Command } from '@langchain/langgraph';

// ============================================================
// 🎯 中断点类型
// ============================================================//
// 【概念】为什么需要"类型"？
// 不同场景需要不同的处理方式：
//   - APPROVAL：需要批准（是/否）
//   - INPUT：需要输入（比如补充信息）
//   - REVIEW：需要审核（查看内容后决定）
export enum InterruptType {
  APPROVAL = 'approval',   // 需要批准
  INPUT = 'input',         // 需要输入
  REVIEW = 'review',       // 需要审核
}

// ============================================================
// 📋 中断请求接口
// ============================================================
export interface InterruptRequest {
  type: InterruptType;         // 中断类型
  nodeId: string;              // 在哪个节点中断
  message: string;             // 给用户的提示信息
  data?: unknown;              // 相关数据（比如要发送的邮件内容）
}

// ============================================================
// ✅ 中断响应接口
// ============================================================
export interface InterruptResponse {
  approved: boolean;           // 是否批准
  input?: string;              // 用户输入（如果需要）
  reason?: string;             // 拒绝原因（如果拒绝）
}

// ============================================================
// 🛠️ 中断管理器 (InterruptManager)
// ============================================================
//
// 【作用】管理所有的中断请求和响应
//
export class InterruptManager {
  private pendingInterrupts: Map<string, InterruptRequest> = new Map();

  /**
   * 创建一个中断请求
   *
   * @param nodeId 节点 ID（比如 "send_email"）
   * @param type 中断类型
   * @param message 给用户的提示
   * @param data 相关数据
   */
  createInterrupt(
    nodeId: string,
    type: InterruptType,
    message: string,
    data?: unknown
  ): InterruptRequest {
    const request: InterruptRequest = {
      type,
      nodeId,
      message,
      data,
    };

    this.pendingInterrupts.set(nodeId, request);
    return request;
  }

  /**
   * 处理中断响应
   *
   * @param nodeId 节点 ID
   * @param response 用户响应
   */
  handleResponse(nodeId: string, response: InterruptResponse): boolean {
    const request = this.pendingInterrupts.get(nodeId);
    if (!request) {
      console.warn(`未找到节点 ${nodeId} 的中断请求`);
      return false;
    }

    if (response.approved) {
      console.log(`✅ 节点 ${nodeId} 已被批准执行`);
      this.pendingInterrupts.delete(nodeId);
      return true;
    } else {
      console.log(`❌ 节点 ${nodeId} 被拒绝执行`);
      console.log(`原因: ${response.reason || '未提供'}`);
      this.pendingInterrupts.delete(nodeId);
      return false;
    }
  }

  /**
   * 获取待处理的中断
   */
  getPendingInterrupt(nodeId: string): InterruptRequest | undefined {
    return this.pendingInterrupts.get(nodeId);
  }

  /**
   * 检查是否有待处理的中断
   */
  hasPendingInterrupt(nodeId: string): boolean {
    return this.pendingInterrupts.has(nodeId);
  }
}

// ============================================================
// 📡 中断辅助函数
// ============================================================//
// 【概念】这些函数让中断操作更简单
/**
 * 创建一个"批准或拒绝"的提示消息
 */
export function createApprovalPrompt(action: string, details: string): string {
  return `⚠️ 即将执行: ${action}\n\n详情:\n${details}\n\n请确认是否继续？(y/n)`;
}

/**
 * 解析用户的批准/拒绝输入
 */
export function parseApprovalInput(input: string): InterruptResponse {
  const normalized = input.trim().toLowerCase();

  if (['y', 'yes', '是', '确认', '批准', '同意'].includes(normalized)) {
    return { approved: true };
  }

  if (['n', 'no', '否', '拒绝', '取消'].includes(normalized)) {
    return { approved: false, reason: '用户拒绝' };
  }

  // 如果输入不是简单的 y/n，可能是有条件的批准
  return {
    approved: false,
    reason: `无效输入: ${input}，请输入 y(是) 或 n(否)`,
  };
}

/**
 * 创建 LangGraph 的恢复命令
 *
 * 【概念】Command 是 LangGraph 的"指令"
 * 当 Agent 被中断后，需要用 Command 来恢复执行
 */
export function createResumeCommand(input: string): Command {
  // Command.resume 表示"从断点恢复执行"
  return new Command({ resume: input });
}

/**
 * 创建 LangGraph 的中断命令
 *
 * 【概念】interrupt() 会立即暂停当前执行
 * 返回一个 Interrupt 对象，包含给用户的信息
 */
export function createInterruptCommand(message: string, data?: unknown): Command {
  return new Command({
    // LangGraph 会把这个信息返回给调用者
    // 用户可以看到这个提示，然后决定是否继续
    update: {
      __interrupt__: {
        message,
        data,
      },
    },
  });
}

// ============================================================
// 💡 使用示例（伪代码）
// ============================================================
/*
// 在 Agent 节点中使用中断：

const sendEmailNode = async (state) => {
  // 准备发送邮件
  const email = state.emailDraft;

  // 触发中断，等待人工确认
  return createInterruptCommand(
    `即将发送邮件给: ${email.to}\n主题: ${email.subject}`,
    email
  );
};

// 用户确认后恢复：
const resumeGraph = async (threadId, userInput) => {
  const command = createResumeCommand(userInput);
  await graph.invoke(command, { configurable: { thread_id: threadId } });
};
*/

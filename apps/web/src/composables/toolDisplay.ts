/**
 * 工具调用人话翻译（M12 P0）
 *
 * 参考 crm-ai-h5 的 constants.ts TOOL_DISPLAY_NAMES 思路：
 * 把底层工具函数名（get_weather / calculator ...）翻译成用户能看懂的中文动作描述，
 * 而不是直接把技术名词展示给用户。
 *
 * 设计原则：
 * - 未登记的工具名 fallback 到原始名称，不阻塞展示（新增 MCP 工具忘了配映射也不会报错/空白）
 * - 后端某些"伪事件"（如 Skills 激活提示、RAG 检索提示）在 catalog.py 里已经拼好了
 *   `[Skills 激活: xxx]` 这种带方括号的中文提示，属于已经是人话的信息通知，不需要二次翻译，
 *   也不需要等待配对的 tool_result（它们本身就是一次性通知，不是"进行中"的操作）
 */

export const TOOL_DISPLAY_NAMES: Record<string, string> = {
  // weather_server.py / 内嵌 fallback
  get_weather: '查询天气',
  _get_weather_fallback: '查询天气',
  // utils_server.py / 内嵌 fallback
  calculator: '计算数学表达式',
  _calculator_fallback: '计算数学表达式',
  search_web: '搜索网络',
  _search_web_fallback: '搜索网络',
  // time_server.py（HTTP MCP）
  get_current_time: '获取当前时间',
  calculate_date_diff: '计算日期差',
  // dangerous_server.py（HITL 危险操作演示）
  delete_all_data: '删除数据（危险操作）',
  transfer_money: '转账（危险操作）',
}

/**
 * 判断是否是后端拼好的"伪工具"信息事件（如 [Skills 激活: xxx] / [RAG 检索]）。
 * 这些本身已经是人话，不需要二次翻译，也不需要等待 tool_result 配对成"完成"状态。
 */
export function isPseudoToolEvent(name: string): boolean {
  return name.startsWith('[') && name.endsWith(']')
}

/**
 * 获取工具的展示名称。
 * - 伪事件：原样返回（后端已经是人话）
 * - 已登记的真实工具：返回中文动作描述
 * - 未登记的工具：fallback 到原始函数名，保证不阻塞渲染
 */
export function getToolDisplayName(name: string): string {
  if (!name) return '未知工具'
  if (isPseudoToolEvent(name)) return name
  return TOOL_DISPLAY_NAMES[name] || name
}

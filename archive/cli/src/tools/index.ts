/**
 * ============================================================
 * 📦 工具定义文件 (tools/index.ts)
 * ============================================================
 *
 * 【小白必读】什么是"工具"？
 *
 * 想象你是一个聪明的助手，但你被关在一个房间里，
 * 只能通过"传话筒"和外界沟通。
 *
 * "工具"就是这些传话筒：
 *   - 想知道天气？→ 用 get_weather 工具
 *   - 想搜索信息？→ 用 search_web 工具
 *   - 想做计算？  → ​用 calculator 工具
 *
 * AI 自己不能直接上网、不能查天气，
 * 但它可以"决定调用哪个工具"，工具帮它完成任务，
 * 再把结果告诉 AI，AI 再整理成人话回答你。
 *
 * 流程：用户提问 → AI 决策 → 调用工具 → 工具返回结果 → AI 回答
 * ============================================================
 */
import { DynamicTool } from '@langchain/core/tools';

// ============================================================
// 🌤️ 工具 1：天气查询
// ============================================================
// DynamicTool 是 LangChain 提供的"工具模板"
// 你只需要填写：名字、描述、执行函数
// AI 会根据"描述"来判断什么时候该用这个工具
export const weatherTool = new DynamicTool({
  // 工具名称：AI 调用时用这个名字
  name: 'get_weather',

  // 工具描述：AI 靠这段话决定"要不要用这个工具"
  // 描述越清晰，AI 判断越准确！
  description: '获取指定城市的天气信息。输入城市名称，返回天气详情。',

  // 执行函数：当 AI 决定调用这个工具时，这里的代码会被执行
  // input 是 AI 传进来的参数（比如"北京"）
  func: async (input: string) => {
    const city = input.trim();

    // 【注意】这里是模拟数据，真实项目中要换成真实的天气 API
    // 比如：高德天气 API、和风天气 API 等
    const mockWeatherData: Record<string, { temp: number; condition: string; humidity: number }> = {
      '北京': { temp: 25, condition: '晴', humidity: 40 },
      '上海': { temp: 28, condition: '多云', humidity: 60 },
      '广州': { temp: 32, condition: '阵雨', humidity: 80 },
      '深圳': { temp: 31, condition: '晴', humidity: 75 },
    };

    const weather = mockWeatherData[city];

    if (weather) {
      // 返回 JSON 字符串，AI 会解析这个结果并整理成自然语言
      return JSON.stringify({
        city,
        temperature: weather.temp,
        condition: weather.condition,
        humidity: weather.humidity,
        suggestion: weather.condition === '阵雨' ? '建议带伞' : '适合出行',
      });
    }

    // 找不到城市时，返回错误提示
    return JSON.stringify({
      city,
      error: '未找到该城市的天气信息',
      suggestion: '请尝试：北京、上海、广州、深圳',
    });
  },
});

// ============================================================
// 🔍 工具 2：联网搜索（模拟）
// ============================================================
export const searchWebTool = new DynamicTool({
  name: 'search_web',
  description: '联网搜索信息。输入搜索关键词，返回搜索结果摘要。',
  func: async (input: string) => {
    const query = input.trim();

    // 【注意】这里是模拟搜索结果
    // 真实项目中可以接入：Bing Search API、Serper API、Tavily API 等
    const mockSearchResults = [
      {
        title: `${query} - 百度百科`,
        snippet: `${query}的相关介绍和详细说明...`,
        url: 'https://baike.baidu.com',
      },
      {
        title: `${query} - 最新资讯`,
        snippet: `关于${query}的最新动态和新闻...`,
        url: 'https://news.example.com',
      },
      {
        title: `${query} - 技术文档`,
        snippet: `${query}的技术实现和开发指南...`,
        url: 'https://docs.example.com',
      },
    ];

    return JSON.stringify({
      query,
      results: mockSearchResults,
      total: mockSearchResults.length,
    });
  },
});

// ============================================================
// 🧮 工具 3：计算器
// ============================================================
export const calculatorTool = new DynamicTool({
  name: 'calculator',
  description: '执行数学计算。输入数学表达式，返回计算结果。例如：2+2、100*5、Math.sqrt(16)',
  func: async (input: string) => {
    try {
      const expression = input.trim();

      // 只允许数字和基本运算符，防止注入攻击
      // 生产环境建议使用 mathjs 等专业库
      const sanitized = expression.replace(/[^0-9+\-*/().Math.sqrtpow ]/g, '');

      // eslint-disable-next-line no-eval
      const result = eval(sanitized);

      return JSON.stringify({
        expression,
        result,
        status: 'success',
      });
    } catch {
      return JSON.stringify({
        expression: input,
        error: '计算失败，请检查表达式格式',
        status: 'error',
      });
    }
  },
});

// ============================================================
// 🗂️ 工具注册中心 (ToolRegistry)
// ============================================================
//
// 【小白必读】为什么需要"注册中心"？
//
// 想象你有一个工具箱，里面放了很多工具。
// ToolRegistry 就是这个工具箱的"目录"：
//   - 你可以往里面放工具（register）
//   - 你可以按名字取工具（get）
//   - 你可以取出所有工具（getAll）
//
// 好处：以后想加新工具，只需要 ToolRegistry.register(新工具)
// 不需要改 Agent 的核心代码，扩展性很好！
// ============================================================
export class ToolRegistry {
  // 用 Map 存储工具，key=工具名，value=工具对象
  // Map 类似于 Python 的 dict，或者 Java 的 HashMap
  private static tools: Map<string, DynamicTool> = new Map();

  /**
   * 注册一个工具到工具箱
   * @param tool 要注册的工具
   */
  static register(tool: DynamicTool): void {
    this.tools.set(tool.name, tool);
  }

  /**
   * 按名字取出一个工具
   * @param name 工具名称
   */
  static get(name: string): DynamicTool | undefined {
    return this.tools.get(name);
  }

  /**
   * 取出工具箱里的所有工具
   */
  static getAll(): DynamicTool[] {
    return Array.from(this.tools.values());
  }

  /**
   * 按名字列表取出多个工具
   * @param names 工具名称数组，比如 ['get_weather', 'calculator']
   */
  static getToolsByNames(names: string[]): DynamicTool[] {
    return names
      .map((name) => this.tools.get(name))
      .filter((tool): tool is DynamicTool => tool !== undefined);
  }
}

// ============================================================
// 🚀 初始化：把所有工具注册到工具箱
// ============================================================
// 这段代码在文件被 import 时自动执行
// 相当于"开店前把所有工具摆上货架"
ToolRegistry.register(weatherTool);
ToolRegistry.register(searchWebTool);
ToolRegistry.register(calculatorTool);

/**
 * 工具定义
 * 
 * Tool 是 Agent 与外部世界交互的桥梁
 * 每个工具都有：名称、描述、参数 Schema、执行函数
 */
import { DynamicTool } from '@langchain/core/tools';

// ============================================
// 工具 1：天气查询
// ============================================
export const weatherTool = new DynamicTool({
  name: 'get_weather',
  description: '获取指定城市的天气信息。输入城市名称，返回天气详情。',
  func: async (input: string) => {
    const city = input.trim();
    
    // 模拟天气 API 调用（实际项目中替换为真实 API）
    const mockWeatherData: Record<string, { temp: number; condition: string; humidity: number }> = {
      '北京': { temp: 25, condition: '晴', humidity: 40 },
      '上海': { temp: 28, condition: '多云', humidity: 60 },
      '广州': { temp: 32, condition: '阵雨', humidity: 80 },
      '深圳': { temp: 31, condition: '晴', humidity: 75 },
    };
    
    const weather = mockWeatherData[city];
    
    if (weather) {
      return JSON.stringify({
        city,
        temperature: weather.temp,
        condition: weather.condition,
        humidity: weather.humidity,
        suggestion: weather.condition === '阵雨' ? '建议带伞' : '适合出行',
      });
    }
    
    return JSON.stringify({
      city,
      error: '未找到该城市的天气信息',
      suggestion: '请尝试：北京、上海、广州、深圳',
    });
  },
});

// ============================================
// 工具 2：联网搜索（模拟）
// ============================================
export const searchWebTool = new DynamicTool({
  name: 'search_web',
  description: '联网搜索信息。输入搜索关键词，返回搜索结果摘要。',
  func: async (input: string) => {
    const query = input.trim();
    
    // 模拟搜索结果（实际项目中替换为真实搜索 API）
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

// ============================================
// 工具 3：计算器
// ============================================
export const calculatorTool = new DynamicTool({
  name: 'calculator',
  description: '执行数学计算。输入数学表达式，返回计算结果。例如：2+2、100*5、sqrt(16)',
  func: async (input: string) => {
    try {
      const expression = input.trim();
      
      // 安全的数学计算（仅支持基本运算）
      // 注意：生产环境应使用专业的数学表达式解析库
      const sanitized = expression.replace(/[^0-9+\-*/().sqrt]/g, '');
      
      // 简单计算（使用 Function 构造器需谨慎，这里仅作演示）
      const result = eval(sanitized);
      
      return JSON.stringify({
        expression,
        result,
        status: 'success',
      });
    } catch (error) {
      return JSON.stringify({
        expression: input,
        error: '计算失败，请检查表达式格式',
        status: 'error',
      });
    }
  },
});

// ============================================
// 工具注册中心
// ============================================
export class ToolRegistry {
  private static tools: Map<string, DynamicTool> = new Map();

  // 注册工具
  static register(tool: DynamicTool): void {
    this.tools.set(tool.name, tool);
  }

  // 获取工具
  static get(name: string): DynamicTool | undefined {
    return this.tools.get(name);
  }

  // 获取所有工具
  static getAll(): DynamicTool[] {
    return Array.from(this.tools.values());
  }

  // 按名称获取工具
  static getToolsByNames(names: string[]): DynamicTool[] {
    return names
      .map((name) => this.tools.get(name))
      .filter((tool): tool is DynamicTool => tool !== undefined);
  }
}

// 初始化注册所有工具
ToolRegistry.register(weatherTool);
ToolRegistry.register(searchWebTool);
ToolRegistry.register(calculatorTool);

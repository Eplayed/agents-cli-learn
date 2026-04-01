/**
 * Agent CLI 入口
 * 
 * 这是阶段 1 的命令行交互界面
 * 
 * 功能：
 * 1. 启动交互式对话
 * 2. 支持多轮对话
 * 3. 显示工具调用过程
 * 4. 流式输出响应
 */
import * as readline from 'readline';
import { LangGraphAgent } from './agent';
import 'dotenv/config';

// ============================================
// 配置
// ============================================
const config = {
  apiKey: process.env.OPENAI_API_KEY || '',
  baseURL: process.env.OPENAI_BASE_URL,
  model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  temperature: 0.7,
  tools: ['get_weather', 'search_web', 'calculator'],
};

// ============================================
// 检查环境变量
// ============================================
if (!config.apiKey) {
  console.error('❌ 错误: 请设置 OPENAI_API_KEY 环境变量');
  console.error('');
  console.error('方法 1: 创建 .env 文件');
  console.error('  OPENAI_API_KEY=sk-xxx');
  console.error('');
  console.error('方法 2: 命令行设置');
  console.error('  export OPENAI_API_KEY=sk-xxx');
  process.exit(1);
}

// ============================================
// 创建 Agent
// ============================================
const agent = new LangGraphAgent(config);

// ============================================
// 会话历史
// ============================================
const conversationHistory: Array<{ role: string; content: string }> = [];

// ============================================
// 创建 readline 接口
// ============================================
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// ============================================
// 打印欢迎信息
// ============================================
function printWelcome() {
  console.log('');
  console.log('╔════════════════════════════════════════════╗');
  console.log('║         🤖 My Agent CLI v1.0.0             ║');
  console.log('╠════════════════════════════════════════════╣');
  console.log('║  可用工具:                                  ║');
  console.log('║  • get_weather - 查询天气                  ║');
  console.log('║  • search_web  - 联网搜索                  ║');
  console.log('║  • calculator  - 数学计算                  ║');
  console.log('╠════════════════════════════════════════════╣');
  console.log('║  命令:                                      ║');
  console.log('║  • /clear - 清空对话历史                   ║');
  console.log('║  • /tools - 查看可用工具                   ║');
  console.log('║  • /exit  - 退出程序                       ║');
  console.log('╚════════════════════════════════════════════╝');
  console.log('');
  console.log('💬 输入问题开始对话 (输入 /exit 退出)');
  console.log('');
}

// ============================================
// 处理用户输入
// ============================================
async function handleInput(userInput: string): Promise<void> {
  const input = userInput.trim();

  // 空输入
  if (!input) {
    return;
  }

  // 命令处理
  if (input.startsWith('/')) {
    const command = input.toLowerCase();

    switch (command) {
      case '/exit':
        console.log('\n👋 再见！');
        rl.close();
        process.exit(0);

      case '/clear':
        conversationHistory.length = 0;
        console.log('\n✅ 对话历史已清空\n');
        return;

      case '/tools':
        console.log('\n📦 可用工具:');
        agent.getAvailableTools().forEach((tool) => {
          console.log(`  • ${tool}`);
        });
        console.log('');
        return;

      default:
        console.log('\n❌ 未知命令，可用命令: /clear, /tools, /exit\n');
        return;
    }
  }

  // 添加用户消息到历史
  conversationHistory.push({ role: 'user', content: input });

  console.log('\n🤖 Agent: ');

  try {
    // ============================================
    // 流式输出
    // ============================================
    let fullResponse = '';

    for await (const chunk of agent.stream(conversationHistory)) {
      switch (chunk.type) {
        case 'text':
          if (chunk.content) {
            process.stdout.write(chunk.content);
            fullResponse += chunk.content;
          }
          break;

        case 'tool_calls':
          if (chunk.data && Array.isArray(chunk.data)) {
            const toolNames = chunk.data.map((t: { name: string }) => t.name).join(', ');
            process.stdout.write(`\n🔧 正在调用工具: ${toolNames}\n`);
          }
          break;

        case 'tool_result':
          // 可以显示工具结果（可选）
          break;

        case 'error':
          console.error('\n❌ 错误:', chunk.content);
          break;

        case 'done':
          // 完成
          break;
      }
    }

    // 添加助手回复到历史
    if (fullResponse) {
      conversationHistory.push({ role: 'assistant', content: fullResponse });
    }

    console.log('\n');
  } catch (error) {
    console.error(
      '\n❌ 执行错误:',
      error instanceof Error ? error.message : String(error)
    );
    console.log('');
  }
}

// ============================================
// 主循环
// ============================================
function main() {
  printWelcome();

  const prompt = () => {
    rl.question('👤 你: ', async (input) => {
      await handleInput(input);
      prompt();
    });
  };

  prompt();
}

// 启动
main();

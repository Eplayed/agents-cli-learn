/**
 * Agent CLI 入口 - 带会话管理
 * 
 * 阶段 2 进阶功能：
 * 1. 会话持久化（Checkpoint）
 * 2. 多会话管理
 * 3. 历史恢复
 * 
 * 功能：
 * 1. 启动交互式对话
 * 2. 支持多轮对话
 * 3. 显示工具调用过程
 * 4. 流式输出响应
 * 5. 会话管理命令
 */
import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';
import { LangGraphAgent } from './agent';
import 'dotenv/config';

// ============================================
// 会话存储目录
// ============================================
const SESSIONS_DIR = path.join(process.cwd(), '.sessions');
const SESSION_FILE = path.join(SESSIONS_DIR, 'sessions.json');

// ============================================
// 会话信息
// ============================================
interface SessionInfo {
  id: string;
  name: string;
  createdAt: string;
  lastMessageAt: string;
  messageCount: number;
}

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
// 会话管理
// ============================================
let currentSession: SessionInfo = createNewSession();
let conversationHistory: Array<{ role: string; content: string }> = [];

// ============================================
// 创建新会话
// ============================================
function createNewSession(): SessionInfo {
  const session: SessionInfo = {
    id: `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    name: `会话 ${new Date().toLocaleString('zh-CN')}`,
    createdAt: new Date().toISOString(),
    lastMessageAt: new Date().toISOString(),
    messageCount: 0,
  };
  
  // 确保目录存在
  if (!fs.existsSync(SESSIONS_DIR)) {
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
  }
  
  // 保存会话
  saveSession(session);
  
  console.log(`\n🆕 新会话已创建: ${session.name}`);
  console.log(`   Session ID: ${session.id}`);
  
  return session;
}

// ============================================
// 保存会话到文件
// ============================================
function saveSession(session: SessionInfo): void {
  try {
    // 读取现有会话
    let sessions: SessionInfo[] = [];
    if (fs.existsSync(SESSION_FILE)) {
      sessions = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf-8'));
    }
    
    // 更新或添加会话
    const index = sessions.findIndex(s => s.id === session.id);
    if (index >= 0) {
      sessions[index] = session;
    } else {
      sessions.push(session);
    }
    
    // 保存
    fs.writeFileSync(SESSION_FILE, JSON.stringify(sessions, null, 2));
  } catch (error) {
    console.error('保存会话失败:', error);
  }
}

// ============================================
// 列出所有会话
// ============================================
function listSessions(): SessionInfo[] {
  try {
    if (!fs.existsSync(SESSION_FILE)) {
      return [];
    }
    return JSON.parse(fs.readFileSync(SESSION_FILE, 'utf-8'));
  } catch (error) {
    console.error('读取会话列表失败:', error);
    return [];
  }
}

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
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║         🤖 My Agent CLI v2.0.0 (带 Checkpoint 记忆)      ║');
  console.log('╠════════════════════════════════════════════════════════╣');
  console.log('║  可用工具:                                              ║');
  console.log('║  • get_weather - 查询天气                               ║');
  console.log('║  • search_web  - 联网搜索                               ║');
  console.log('║  • calculator  - 数学计算                               ║');
  console.log('╠════════════════════════════════════════════════════════╣');
  console.log('║  命令:                                                  ║');
  console.log('║  • /new       - 创建新会话                             ║');
  console.log('║  • /sessions  - 列出所有会话                           ║');
  console.log('║  • /switch    - 切换会话                               ║');
  console.log('║  • /history   - 查看当前会话历史                       ║');
  console.log('║  • /clear     - 清空对话历史                          ║');
  console.log('║  • /tools     - 查看可用工具                          ║');
  console.log('║  • /help      - 显示帮助                              ║');
  console.log('║  • /exit      - 退出程序                              ║');
  console.log('╚════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`📝 当前会话: ${currentSession.name}`);
  console.log(`   Session ID: ${currentSession.id}`);
  console.log('');
  console.log('💬 输入问题开始对话 (输入 /exit 退出)');
  console.log('');
}

// ============================================
// 打印帮助
// ============================================
function printHelp() {
  console.log('');
  console.log('📚 Checkpoint 记忆功能说明:');
  console.log('');
  console.log('1. 会话自动保存');
  console.log('   • 每次对话后会自动保存到 Checkpoint');
  console.log('   • 可以通过 /sessions 查看所有会话');
  console.log('   • 可以通过 /switch 切换会话');
  console.log('');
  console.log('2. 状态恢复');
  console.log('   • 可以恢复到之前的任意状态');
  console.log('   • 使用 /history 查看当前会话历史');
  console.log('');
  console.log('3. 多会话支持');
  console.log('   • 可以同时维护多个会话');
  console.log('   • 每个会话有独立的上下文');
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
    const parts = input.toLowerCase().split(/\s+/);
    const command = parts[0];
    const args = parts.slice(1);

    switch (command) {
      // 退出
      case '/exit':
        console.log('\n👋 再见！');
        rl.close();
        process.exit(0);

      // 清空历史
      case '/clear':
        conversationHistory.length = 0;
        console.log('\n✅ 对话历史已清空\n');
        return;

      // 查看工具
      case '/tools':
        console.log('\n📦 可用工具:');
        agent.getAvailableTools().forEach((tool) => {
          console.log(`  • ${tool}`);
        });
        console.log('');
        return;

      // 帮助
      case '/help':
        printHelp();
        return;

      // 新建会话
      case '/new':
        // 保存当前会话
        saveSession(currentSession);
        // 创建新会话
        currentSession = createNewSession();
        conversationHistory = [];
        console.log('');
        return;

      // 列出所有会话
      case '/sessions':
        const sessions = listSessions();
        console.log('\n📋 所有会话:');
        if (sessions.length === 0) {
          console.log('  (暂无会话)');
        } else {
          sessions.forEach((s, i) => {
            const marker = s.id === currentSession.id ? '▶' : ' ';
            const date = new Date(s.lastMessageAt).toLocaleString('zh-CN');
            console.log(`  ${marker} ${i + 1}. ${s.name}`);
            console.log(`     ID: ${s.id} | 消息数: ${s.messageCount} | 最后活动: ${date}`);
          });
        }
        console.log('');
        return;

      // 切换会话
      case '/switch':
        if (args.length === 0) {
          console.log('\n❌ 请指定会话 ID');
          console.log('   使用 /sessions 查看所有会话');
          console.log('   使用 /switch <session_id> 切换');
          console.log('');
          return;
        }
        
        const targetSessionId = args[0];
        const sessions2 = listSessions();
        const targetSession = sessions2.find(s => s.id === targetSessionId);
        
        if (!targetSession) {
          console.log('\n❌ 未找到指定会话');
          console.log('');
          return;
        }
        
        // 切换会话
        saveSession(currentSession);
        currentSession = targetSession;
        conversationHistory = [];
        
        // 加载历史
        const history = await agent.getSessionHistory(currentSession.id, 50);
        if (history.length > 0) {
          // 过滤掉系统消息用于显示
          conversationHistory = history.filter(m => m.role !== 'system');
        }
        
        console.log(`\n✅ 已切换到会话: ${currentSession.name}`);
        console.log(`   已加载 ${conversationHistory.length} 条消息`);
        console.log('');
        return;

      // 查看历史
      case '/history':
        const fullHistory = await agent.getSessionHistory(currentSession.id, 20);
        console.log('\n📜 会话历史:');
        if (fullHistory.length === 0) {
          console.log('  (暂无历史)');
        } else {
          fullHistory.forEach((msg, i) => {
            const role = msg.role === 'user' ? '👤' : '🤖';
            const content = msg.content.length > 80 
              ? msg.content.substring(0, 80) + '...' 
              : msg.content;
            console.log(`  ${role} ${i + 1}. ${content}`);
          });
        }
        console.log('');
        return;

      // 列出检查点
      case '/checkpoints':
        const checkpoints = await agent.listCheckpoints(currentSession.id);
        console.log('\n📍 检查点列表:');
        if (checkpoints.length === 0) {
          console.log('  (暂无检查点)');
        } else {
          checkpoints.reverse().forEach((cp, i) => {
            const date = new Date(cp.timestamp).toLocaleString('zh-CN');
            console.log(`  ${i + 1}. ${cp.id}`);
            console.log(`     时间: ${date}`);
          });
        }
        console.log('');
        return;

      default:
        console.log('\n❌ 未知命令，可用命令:');
        console.log('   /new, /sessions, /switch, /history, /checkpoints');
        console.log('   /clear, /tools, /help, /exit');
        console.log('');
        return;
    }
  }

  // ============================================
  // 正常对话
  // ============================================
  
  // 添加用户消息到历史
  conversationHistory.push({ role: 'user', content: input });

  // 更新会话统计
  currentSession.messageCount++;
  currentSession.lastMessageAt = new Date().toISOString();

  console.log('\n🤖 Agent: ');

  try {
    // ============================================
    // 流式输出（带 Checkpoint）
    // ============================================
    let fullResponse = '';

    for await (const chunk of agent.stream(conversationHistory, {
      threadId: currentSession.id,
    })) {
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
          break;

        case 'error':
          console.error('\n❌ 错误:', chunk.content);
          break;

        case 'done':
          break;
      }
    }

    // 添加助手回复到历史
    if (fullResponse) {
      conversationHistory.push({ role: 'assistant', content: fullResponse });
    }

    console.log('\n');

    // ============================================
    // 保存会话状态
    // ============================================
    saveSession(currentSession);

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

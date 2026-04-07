/**
 * ============================================================
 * 🤖 Agent CLI 入口 - Multi-Agent 支持 (v3.0)
 * ============================================================
 *
 * 阶段 1: 单 Agent + Tool Calling + 流式输出
 * 阶段 2: Checkpoint 记忆 + 多会话管理
 * 阶段 3: Multi-Agent 协作（Sequential/Parallel/Supervisor/GroupChat/TeamGraph）
 *
 * 新增命令：
 *   /team sequential  - 顺序执行 Multi-Agent
 *   /team parallel    - 并行执行 Multi-Agent
 *   /team supervisor  - 主管模式执行
 *   /team groupchat   - 群聊模式执行
 *   /team graph       - LangGraph TeamGraph 模式
 * ============================================================
 */

import * as readline from "readline";
import * as fs from "fs";
import * as path from "path";
import dotenv from "dotenv";
import { LangGraphAgent } from "./agent";
import {
  AgentFactory,
  Crew,
  executeSequential,
  executeParallel,
  executeSupervisor,
  GroupChat,
  TeamGraph,
} from "./multi-agent";
import type { Task } from "./multi-agent";

dotenv.config({
  path:
    process.env.DOTENV_CONFIG_PATH ||
    (fs.existsSync(path.join(process.cwd(), ".env"))
      ? path.join(process.cwd(), ".env")
      : fs.existsSync(path.join(process.cwd(), ".env.dev"))
        ? path.join(process.cwd(), ".env.dev")
        : undefined),
});

// ============================================
// 会话存储目录
// ============================================
const SESSIONS_DIR = path.join(process.cwd(), ".sessions");
const SESSION_FILE = path.join(SESSIONS_DIR, "sessions.json");

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
  apiKey: process.env.OPENAI_API_KEY || "",
  baseURL: process.env.OPENAI_BASE_URL,
  model: process.env.OPENAI_MODEL || "gpt-4o-mini",
  temperature: 0.7,
  tools: ["get_weather", "search_web", "calculator"],
};

// ============================================
// 检查环境变量
// ============================================
if (!config.apiKey) {
  console.error("❌ 错误: 请设置 OPENAI_API_KEY 环境变量");
  console.error("");
  console.error("方法 1: 创建 .env 文件");
  console.error("  OPENAI_API_KEY=sk-xxx");
  console.error("");
  console.error("方法 2: 命令行设置");
  console.error("  export OPENAI_API_KEY=sk-xxx");
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
    name: `会话 ${new Date().toLocaleString("zh-CN")}`,
    createdAt: new Date().toISOString(),
    lastMessageAt: new Date().toISOString(),
    messageCount: 0,
  };

  if (!fs.existsSync(SESSIONS_DIR)) {
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
  }

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
    let sessions: SessionInfo[] = [];
    if (fs.existsSync(SESSION_FILE)) {
      sessions = JSON.parse(fs.readFileSync(SESSION_FILE, "utf-8"));
    }

    const index = sessions.findIndex((s) => s.id === session.id);
    if (index >= 0) {
      sessions[index] = session;
    } else {
      sessions.push(session);
    }

    fs.writeFileSync(SESSION_FILE, JSON.stringify(sessions, null, 2));
  } catch (error) {
    console.error("保存会话失败:", error);
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
    return JSON.parse(fs.readFileSync(SESSION_FILE, "utf-8"));
  } catch (error) {
    console.error("读取会话列表失败:", error);
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
  console.log("");
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║     🤖 My Agent CLI v3.0.0 (Multi-Agent 协作版)          ║");
  console.log("╠════════════════════════════════════════════════════════════╣");
  console.log("║  🔧 单 Agent 工具:                                        ║");
  console.log("║  • get_weather - 查询天气                                 ║");
  console.log("║  • search_web  - 联网搜索                                 ║");
  console.log("║  • calculator  - 数学计算                                 ║");
  console.log("╠════════════════════════════════════════════════════════════╣");
  console.log("║  👥 Multi-Agent 命令:                                     ║");
  console.log("║  • /team sequential <主题>  - 顺序执行（研究→写作→审稿）  ║");
  console.log("║  • /team parallel <主题>    - 并行执行                    ║");
  console.log("║  • /team supervisor <主题>  - 主管模式                    ║");
  console.log("║  • /team groupchat <主题>    - 群聊讨论                    ║");
  console.log("║  • /team graph <主题>       - LangGraph TeamGraph         ║");
  console.log("╠════════════════════════════════════════════════════════════╣");
  console.log("║  📋 会话命令:                                             ║");
  console.log("║  • /new       - 创建新会话                               ║");
  console.log("║  • /sessions  - 列出所有会话                              ║");
  console.log("║  • /switch    - 切换会话                                  ║");
  console.log("║  • /history   - 查看当前会话历史                          ║");
  console.log("║  • /checkpoints - 查看检查点                              ║");
  console.log("║  • /clear     - 清空对话历史                              ║");
  console.log("║  • /tools     - 查看可用工具                              ║");
  console.log("║  • /help      - 显示帮助                                  ║");
  console.log("║  • /exit      - 退出程序                                  ║");
  console.log("╚════════════════════════════════════════════════════════════╝");
  console.log("");
  console.log(`📝 当前会话: ${currentSession.name}`);
  console.log(`   Session ID: ${currentSession.id}`);
  console.log("");
  console.log("💬 输入问题开始对话 (输入 /exit 退出)");
  console.log("");
}

// ============================================
// 打印帮助
// ============================================
function printHelp() {
  console.log("");
  console.log("📚 功能说明:");
  console.log("");
  console.log("🔧 单 Agent 模式:");
  console.log("   直接输入问题，AI 会自主决定是否调用工具");
  console.log("");
  console.log("👥 Multi-Agent 模式:");
  console.log("   /team sequential <主题>");
  console.log("     → 研究员搜索信息 → 作家写文章 → 审稿人审核");
  console.log("");
  console.log("   /team parallel <主题>");
  console.log("     → 多个 Agent 同时处理同一个主题");
  console.log("");
  console.log("   /team supervisor <主题>");
  console.log("     → 主管 Agent 分析任务，分配给下属执行");
  console.log("");
  console.log("   /team groupchat <主题>");
  console.log("     → 多个 Agent 在群里讨论（AutoGen 风格）");
  console.log("");
  console.log("   /team graph <主题>");
  console.log("     → LangGraph 状态机驱动 Multi-Agent");
  console.log("");
  console.log("📋 会话管理:");
  console.log("   /new       - 新建会话（不同会话互不影响）");
  console.log("   /sessions  - 列出所有会话");
  console.log("   /switch id - 切换到指定会话");
  console.log("   /history   - 查看当前会话的聊天记录");
  console.log("   /checkpoints - 查看 Checkpoint 存档");
  console.log("");
}

// ============================================
// 👥 Multi-Agent 处理
// ============================================

/**
 * 创建 Multi-Agent 团队
 */
function createTeam() {
  const researcher = AgentFactory.create("researcher", config.apiKey, config.model);
  const writer = AgentFactory.create("writer", config.apiKey, config.model);
  const reviewer = AgentFactory.create("reviewer", config.apiKey, config.model);
  return { researcher, writer, reviewer };
}

/**
 * 模式 1: 顺序执行
 * 流程: 研究员 → 作家 → 审稿人
 */
async function runSequential(topic: string): Promise<void> {
  console.log("\n🔄 ===== Sequential 模式 =====");
  console.log(`   主题: ${topic}\n`);

  const { researcher, writer, reviewer } = createTeam();

  const tasks: Task[] = [
    {
      description: `研究主题：${topic}`,
      expectedOutput: "结构化的研究报告",
      agent: researcher,
      status: "pending",
    },
    {
      description: "根据研究报告撰写文章",
      expectedOutput: "完整的文章",
      agent: writer,
      status: "pending",
    },
    {
      description: "审查并润色文章",
      expectedOutput: "最终版文章",
      agent: reviewer,
      status: "pending",
    },
  ];

  const result = await executeSequential(tasks);
  printCrewResult(result);
}

/**
 * 模式 2: 并行执行
 * 流程: 多个 Agent 同时处理
 */
async function runParallel(topic: string): Promise<void> {
  console.log("\n⚡ ===== Parallel 模式 =====");
  console.log(`   主题: ${topic}\n`);

  const { researcher, writer, reviewer } = createTeam();

  const tasks: Task[] = [
    {
      description: `从技术角度分析：${topic}`,
      expectedOutput: "技术分析报告",
      agent: researcher,
      status: "pending",
    },
    {
      description: `从商业角度分析：${topic}`,
      expectedOutput: "商业分析报告",
      agent: writer,
      status: "pending",
    },
    {
      description: `从风险角度分析：${topic}`,
      expectedOutput: "风险评估报告",
      agent: reviewer,
      status: "pending",
    },
  ];

  const result = await executeParallel(tasks);
  printCrewResult(result);
}

/**
 * 模式 3: 主管模式
 * 流程: 主管分析 → 分配任务 → 汇总
 */
async function runSupervisor(topic: string): Promise<void> {
  console.log("\n👑 ===== Supervisor 模式 =====");
  console.log(`   主题: ${topic}\n`);

  const { researcher, writer, reviewer } = createTeam();
  const supervisor = AgentFactory.create("researcher", config.apiKey, config.model);

  const result = await executeSupervisor(
    supervisor,
    [researcher, writer, reviewer],
    topic
  );
  printCrewResult(result);
}

/**
 * 模式 4: 群聊模式
 * 流程: Agent 们自由讨论
 */
async function runGroupChat(topic: string): Promise<void> {
  console.log("\n💬 ===== GroupChat 模式 =====");
  console.log(`   主题: ${topic}\n`);

  const { researcher, writer, reviewer } = createTeam();

  const chat = new GroupChat(
    [researcher, writer, reviewer],
    config.apiKey,
    config.model,
    { maxRounds: 5, verbose: true }
  );

  const result = await chat.chat(topic);

  console.log("\n" + "=".repeat(50));
  console.log("💬 群聊总结:");
  console.log(`   共讨论了 ${result.rounds} 轮`);
  console.log(`   最终答案:\n${result.finalAnswer.slice(0, 500)}...`);
}

/**
 * 模式 5: LangGraph TeamGraph
 * 流程: StateGraph 驱动的 Multi-Agent
 */
async function runTeamGraph(topic: string): Promise<void> {
  console.log("\n🏛️ ===== LangGraph TeamGraph 模式 =====");
  console.log(`   主题: ${topic}\n`);

  const team = new TeamGraph({ apiKey: config.apiKey, model: config.model });

  const result = await team.run(topic);

  console.log("🏛️ 最终产出:");
  console.log(result.finalAnswer.slice(0, 1000));
  if (result.finalAnswer.length > 1000) {
    console.log("...(已截断)");
  }
}

/**
 * 打印 Crew 执行结果
 */
function printCrewResult(result: import("./multi-agent").CrewResult): void {
  console.log("\n" + "=".repeat(50));
  console.log("📊 执行结果:");
  console.log(`   模式: ${result.mode}`);
  console.log(`   总耗时: ${result.totalDuration}ms`);
  console.log("");

  result.results.forEach((r, i) => {
    const statusIcon = r.status === "completed" ? "✅" : "❌";
    console.log(`   ${statusIcon} ${i + 1}. ${r.agentName}`);
    console.log(`      任务: ${r.taskDescription.slice(0, 50)}...`);
    console.log(`      耗时: ${r.duration}ms`);
    console.log(`      输出: ${r.output.slice(0, 100)}...`);
    console.log("");
  });
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
  if (input.startsWith("/")) {
    const parts = input.split(/\s+/);
    const command = parts[0].toLowerCase();
    const args = parts.slice(1);

    switch (command) {
      // 退出
      case "/exit":
        console.log("\n👋 再见！");
        rl.close();
        process.exit(0);

      // 清空历史
      case "/clear":
        conversationHistory = [];
        console.log("\n✅ 对话历史已清空\n");
        return;

      // 查看工具
      case "/tools":
        console.log("\n📦 可用工具:");
        agent.getAvailableTools().forEach((tool) => {
          console.log(`  • ${tool}`);
        });
        console.log("");
        return;

      // 帮助
      case "/help":
        printHelp();
        return;

      // Multi-Agent 命令
      case "/team": {
        const mode = args[0]?.toLowerCase();
        const topic = args.slice(1).join(" ");

        if (!mode || !topic) {
          console.log("\n❌ 用法: /team <mode> <topic>");
          console.log("   mode: sequential | parallel | supervisor | groupchat | graph");
          console.log("   example: /team sequential AI Agent 的未来发展趋势");
          console.log("");
          return;
        }

        try {
          switch (mode) {
            case "sequential":
              await runSequential(topic);
              break;
            case "parallel":
              await runParallel(topic);
              break;
            case "supervisor":
              await runSupervisor(topic);
              break;
            case "groupchat":
              await runGroupChat(topic);
              break;
            case "graph":
              await runTeamGraph(topic);
              break;
            default:
              console.log(`\n❌ 未知模式: ${mode}`);
              console.log("   可用模式: sequential, parallel, supervisor, groupchat, graph\n");
              return;
          }
        } catch (error) {
          console.error(
            "\n❌ Multi-Agent 执行失败:",
            error instanceof Error ? error.message : String(error)
          );
        }
        console.log("");
        return;
      }

      // 新建会话
      case "/new":
        saveSession(currentSession);
        currentSession = createNewSession();
        conversationHistory = [];
        console.log("");
        return;

      // 列出所有会话
      case "/sessions": {
        const sessions = listSessions();
        console.log("\n📋 所有会话:");
        if (sessions.length === 0) {
          console.log("  (暂无会话)");
        } else {
          sessions.forEach((s, i) => {
            const marker = s.id === currentSession.id ? "▶" : " ";
            const date = new Date(s.lastMessageAt).toLocaleString("zh-CN");
            console.log(`  ${marker} ${i + 1}. ${s.name}`);
            console.log(`     ID: ${s.id} | 消息数: ${s.messageCount} | 最后活动: ${date}`);
          });
        }
        console.log("");
        return;
      }

      // 切换会话
      case "/switch": {
        if (args.length === 0) {
          console.log("\n❌ 请指定会话 ID");
          console.log("   使用 /sessions 查看所有会话");
          console.log("   使用 /switch <session_id> 切换");
          console.log("");
          return;
        }

        const targetSessionId = args[0];
        const sessions2 = listSessions();
        const targetSession = sessions2.find((s) => s.id === targetSessionId);

        if (!targetSession) {
          console.log("\n❌ 未找到指定会话");
          console.log("");
          return;
        }

        saveSession(currentSession);
        currentSession = targetSession;
        conversationHistory = [];

        const history = await agent.getSessionHistory(currentSession.id, 50);
        if (history.length > 0) {
          conversationHistory = history.filter((m) => m.role !== "system");
        }

        console.log(`\n✅ 已切换到会话: ${currentSession.name}`);
        console.log(`   已加载 ${conversationHistory.length} 条消息`);
        console.log("");
        return;
      }

      // 查看历史
      case "/history": {
        const fullHistory = await agent.getSessionHistory(currentSession.id, 20);
        console.log("\n📜 会话历史:");
        if (fullHistory.length === 0) {
          console.log("  (暂无历史)");
        } else {
          fullHistory.forEach((msg, i) => {
            const role = msg.role === "user" ? "👤" : "🤖";
            const content =
              msg.content.length > 80
                ? msg.content.substring(0, 80) + "..."
                : msg.content;
            console.log(`  ${role} ${i + 1}. ${content}`);
          });
        }
        console.log("");
        return;
      }

      // 列出检查点
      case "/checkpoints": {
        const checkpoints = await agent.listCheckpoints(currentSession.id);
        console.log("\n📍 检查点列表:");
        if (checkpoints.length === 0) {
          console.log("  (暂无检查点)");
        } else {
          checkpoints.reverse().forEach((cp, i) => {
            const date = new Date(cp.timestamp).toLocaleString("zh-CN");
            console.log(`  ${i + 1}. ${cp.id}`);
            console.log(`     时间: ${date}`);
          });
        }
        console.log("");
        return;
      }

      default:
        console.log("\n❌ 未知命令，可用命令:");
        console.log("   /team sequential|parallel|supervisor|groupchat|graph <主题>");
        console.log("   /new, /sessions, /switch, /history, /checkpoints");
        console.log("   /clear, /tools, /help, /exit");
        console.log("");
        return;
    }
  }

  // ============================================
  // 正常对话（单 Agent 模式）
  // ============================================

  conversationHistory.push({ role: "user", content: input });
  currentSession.messageCount++;
  currentSession.lastMessageAt = new Date().toISOString();

  console.log("\n🤖 Agent: ");

  try {
    let fullResponse = "";

    for await (const chunk of agent.stream(conversationHistory, {
      threadId: currentSession.id,
    })) {
      switch (chunk.type) {
        case "text":
          if (chunk.content) {
            process.stdout.write(chunk.content);
            fullResponse += chunk.content;
          }
          break;

        case "tool_calls":
          if (chunk.data && Array.isArray(chunk.data)) {
            const toolNames = chunk.data
              .map((t: { name: string }) => t.name)
              .join(", ");
            process.stdout.write(`\n🔧 正在调用工具: ${toolNames}\n`);
          }
          break;

        case "tool_result":
          break;

        case "error":
          console.error("\n❌ 错误:", chunk.content);
          break;

        case "done":
          break;
      }
    }

    if (fullResponse) {
      conversationHistory.push({ role: "assistant", content: fullResponse });
    }

    console.log("\n");
    saveSession(currentSession);
  } catch (error) {
    console.error(
      "\n❌ 执行错误:",
      error instanceof Error ? error.message : String(error)
    );
    console.log("");
  }
}

// ============================================
// 主循环
// ============================================
function main() {
  printWelcome();

  const prompt = () => {
    rl.question("👤 你: ", async (input) => {
      await handleInput(input);
      prompt();
    });
  };

  prompt();
}

// 启动
main();

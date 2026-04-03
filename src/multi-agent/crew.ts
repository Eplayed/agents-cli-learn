/**
 * ============================================================
 * 🎯 Crew 编排模块 (crew.ts)
 * ============================================================
 *
 * 【小白必读】什么是 Crew？
 *
 * Crew = 团队！就像组建一个项目团队：
 *   - 招人（创建 Agent）
 *   - 分配任务（创建 Task）
 *   - 安排执行顺序（Sequential / Parallel / Supervisor）
 *
 * 三种编排模式：
 *   1. Sequential（顺序执行）：A → B → C（一个做完再做下一个）
 *   2. Parallel（并行执行）：A B C 同时做（同时进行）
 *   3. Supervisor（主管模式）：Boss 分配任务给 A/B/C
 *
 * 类比：
 *   Sequential = 流水线工人，一个传给下一个
 *   Parallel   = 多个厨师同时做菜
 *   Supervisor = 项目经理分配任务
 *
 * ============================================================
 */

import { AgentInstance } from "./agents";

// ============================================================
// 📋 任务定义
// ============================================================

/**
 * 任务接口
 *
 * 【概念】Task = 给 Agent 的一张"工作单"
 *   - description: 要做什么（工作内容）
 *   - expectedOutput: 做成什么样（交付标准）
 *   - agent: 谁来做（负责人）
 */
export interface Task {
  /** 任务描述 */
  description: string;
  /** 期望输出 */
  expectedOutput: string;
  /** 负责的 Agent */
  agent: AgentInstance;
  /** 任务状态 */
  status: "pending" | "running" | "completed" | "failed";
  /** 任务输出 */
  output?: string;
  /** 执行时间（毫秒） */
  duration?: number;
}

/**
 * 任务执行结果
 */
export interface TaskResult {
  taskDescription: string;
  agentName: string;
  output: string;
  duration: number;
  status: "completed" | "failed";
  error?: string;
}

// ============================================================
// 📊 Crew 执行结果
// ============================================================

export interface CrewResult {
  /** 所有任务的执行结果 */
  results: TaskResult[];
  /** 总执行时间 */
  totalDuration: number;
  /** 编排模式 */
  mode: "sequential" | "parallel" | "supervisor";
}

// ============================================================
// 🔄 模式 1：顺序执行 (Sequential)
// ============================================================

/**
 * 【概念】Sequential = 流水线
 *   任务按顺序执行，前一个完成后才做下一个
 *   每个任务的输出会传给下一个任务
 *
 * 流程图：
 *   Task A ──→ Task B ──→ Task C
 *   (研究)    (写作)     (审稿)
 *
 * 【场景】写作流水线：研究 → 写作 → 审稿
 */
export async function executeSequential(
  tasks: Task[]
): Promise<CrewResult> {
  console.log("\n🔄 Sequential 模式启动");
  console.log(`   任务数量: ${tasks.length}`);
  console.log("   执行顺序: " + tasks.map((t) => t.agent.profile.name).join(" → "));
  console.log("   ".repeat(40));

  const results: TaskResult[] = [];
  const startTime = Date.now();
  let context = ""; // 上一个任务的输出，传给下一个

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    const taskLabel = `[${i + 1}/${tasks.length}]`;

    try {
      // 标记任务开始
      task.status = "running";
      const taskStart = Date.now();
      console.log(`${taskLabel} 🏃 ${task.agent.profile.name} 开始执行...`);
      console.log(`   任务: ${task.description.slice(0, 50)}...`);

      // 把上一个任务的输出作为上下文传给当前任务
      const taskInput = context
        ? `${task.description}\n\n【参考素材】\n${context}`
        : task.description;

      // 执行任务
      const output = await task.agent.execute(taskInput);

      // 记录结果
      const taskDuration = Date.now() - taskStart;
      task.status = "completed";
      task.output = output;
      context = output; // 传递给下一个任务

      results.push({
        taskDescription: task.description,
        agentName: task.agent.profile.name,
        output: output,
        duration: taskDuration,
        status: "completed",
      });

      console.log(`   ✅ 完成 (${taskDuration}ms)`);
      console.log(`   输出: ${output.slice(0, 80)}...`);
    } catch (error) {
      // 任务失败
      task.status = "failed";
      results.push({
        taskDescription: task.description,
        agentName: task.agent.profile.name,
        output: "",
        duration: Date.now() - startTime,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      });
      console.log(`   ❌ 失败: ${error instanceof Error ? error.message : error}`);
      // 顺序模式下，一个失败就停止
      break;
    }
  }

  console.log("   ".repeat(40));
  console.log(`🔄 Sequential 模式完成 (${Date.now() - startTime}ms)`);

  return {
    results,
    totalDuration: Date.now() - startTime,
    mode: "sequential",
  };
}

// ============================================================
// ⚡ 模式 2：并行执行 (Parallel)
// ============================================================

/**
 * 【概念】Parallel = 同时进行
 *   所有任务同时开始，谁先做完谁先结束
 *
 * 流程图：
 *        ┌─→ Task A ─→
 * START ─┼─→ Task B ─→┬─→ END
 *        └─→ Task C ─→┘
 *
 * 【场景】多人同时做不同的事：搜索天气 + 搜索新闻 + 搜索股票
 */
export async function executeParallel(
  tasks: Task[]
): Promise<CrewResult> {
  console.log("\n⚡ Parallel 模式启动");
  console.log(`   任务数量: ${tasks.length}`);
  console.log(
    "   并行任务: " + tasks.map((t) => t.agent.profile.name).join(" | ")
  );
  console.log("   ".repeat(40));

  const startTime = Date.now();

  // Promise.all = 同时执行所有任务
  const promises = tasks.map(async (task, index) => {
    const taskLabel = `[P${index + 1}]`;

    try {
      task.status = "running";
      const taskStart = Date.now();
      console.log(`${taskLabel} 🏃 ${task.agent.profile.name} 开始执行...`);

      const output = await task.agent.execute(task.description);

      const taskDuration = Date.now() - taskStart;
      task.status = "completed";
      task.output = output;

      console.log(`${taskLabel} ✅ ${task.agent.profile.name} 完成 (${taskDuration}ms)`);

      return {
        taskDescription: task.description,
        agentName: task.agent.profile.name,
        output,
        duration: taskDuration,
        status: "completed" as const,
      };
    } catch (error) {
      task.status = "failed";
      console.log(
        `${taskLabel} ❌ ${task.agent.profile.name} 失败: ${error}`
      );
      return {
        taskDescription: task.description,
        agentName: task.agent.profile.name,
        output: "",
        duration: Date.now() - startTime,
        status: "failed" as const,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  const results = await Promise.all(promises);

  console.log("   ".repeat(40));
  console.log(`⚡ Parallel 模式完成 (${Date.now() - startTime}ms)`);

  return {
    results,
    totalDuration: Date.now() - startTime,
    mode: "parallel",
  };
}

// ============================================================
// 👑 模式 3：主管模式 (Supervisor)
// ============================================================

/**
 * 【概念】Supervisor = 项目经理
 *   主管 Agent 分析任务，然后分配给合适的下属
 *   下属做完后，主管汇总结果
 *
 * 流程图：
 *        用户需求
 *           │
 *           ▼
 *      ┌──────────┐
 *      │ Supervisor│ ← 主管分析任务
 *      │  (Boss)   │
 *      └────┬─────┘
 *           │ 分配
 *    ┌──────┼──────┐
 *    ▼      ▼      ▼
 *  AgentA AgentB AgentC  ← 下属执行
 *    │      │      │
 *    ▼      ▼      ▼
 *      汇总结果
 *           │
 *           ▼
 *      Supervisor 汇总
 *           │
 *           ▼
 *        最终输出
 *
 * 【场景】老板说"写篇报告"，主管分配：你搜索、你写、你审
 */
export async function executeSupervisor(
  supervisor: AgentInstance,
  workers: AgentInstance[],
  userRequest: string
): Promise<CrewResult> {
  console.log("\n👑 Supervisor 模式启动");
  console.log(`   主管: ${supervisor.profile.name}`);
  console.log(
    `   下属: ${workers.map((w) => w.profile.name).join(", ")}`
  );
  console.log(`   用户需求: ${userRequest.slice(0, 50)}...`);
  console.log("   ".repeat(40));

  const startTime = Date.now();
  const results: TaskResult[] = [];

  // ─────────────────────────────────────────────────────────
  // Step 1: 主管分析任务，分配工作
  // ─────────────────────────────────────────────────────────
  console.log("📋 Step 1: 主管分析任务...");
  const workerList = workers
    .map((w, i) => `${i + 1}. ${w.profile.name}(${w.profile.role})`)
    .join("\n");

  const planningPrompt = `你是一个项目主管，需要把用户的需求分配给合适的下属。

## 可用下属
${workerList}

## 用户需求
${userRequest}

## 请输出分配方案（JSON 格式）
\`\`\`json
{
  "tasks": [
    {
      "assignee": "下属名字",
      "task": "具体任务描述",
      "expectedOutput": "期望输出"
    }
  ]
}
\`\`\``;

  const plan = await supervisor.execute(planningPrompt);
  console.log(`   主管分配方案:\n${plan.slice(0, 200)}...`);

  // ─────────────────────────────────────────────────────────
  // Step 2: 解析分配方案，执行任务
  // ─────────────────────────────────────────────────────────
  console.log("\n📋 Step 2: 下属执行任务...");

  // 从主管的回复中提取 JSON
  const jsonMatch = plan.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.log("   ❌ 主管分配方案解析失败，使用默认顺序分配");
    // 默认：每个 worker 都参与
    for (const worker of workers) {
      try {
        const taskStart = Date.now();
        console.log(`   🏃 ${worker.profile.name} 开始执行...`);
        const output = await worker.execute(userRequest);
        results.push({
          taskDescription: userRequest,
          agentName: worker.profile.name,
          output,
          duration: Date.now() - taskStart,
          status: "completed",
        });
        console.log(`   ✅ ${worker.profile.name} 完成`);
      } catch (error) {
        results.push({
          taskDescription: userRequest,
          agentName: worker.profile.name,
          output: "",
          duration: Date.now() - startTime,
          status: "failed",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  } else {
    // 解析 JSON 分配方案
    try {
      const planJson = JSON.parse(jsonMatch[0]);
      const tasks = planJson.tasks || [];

      for (const task of tasks) {
        // 找到对应的 worker
        const worker = workers.find(
          (w) => w.profile.name === task.assignee
        );
        if (!worker) {
          console.log(`   ⚠️ 未找到下属: ${task.assignee}，跳过`);
          continue;
        }

        try {
          const taskStart = Date.now();
          console.log(`   🏃 ${task.assignee} 执行: ${task.task.slice(0, 40)}...`);
          const output = await worker.execute(task.task);
          results.push({
            taskDescription: task.task,
            agentName: task.assignee,
            output,
            duration: Date.now() - taskStart,
            status: "completed",
          });
          console.log(`   ✅ ${task.assignee} 完成`);
        } catch (error) {
          const taskStartErr = Date.now();
          results.push({
            taskDescription: task.task,
            agentName: task.assignee,
            output: "",
            duration: Date.now() - taskStartErr,
            status: "failed",
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    } catch (parseError) {
      console.log(`   ❌ JSON 解析失败: ${parseError}`);
    }
  }

  // ─────────────────────────────────────────────────────────
  // Step 3: 主管汇总结果
  // ─────────────────────────────────────────────────────────
  console.log("\n📋 Step 3: 主管汇总结果...");
  const workerOutputs = results
    .filter((r) => r.status === "completed")
    .map(
      (r) => `### ${r.agentName} 的产出\n${r.output.slice(0, 300)}...`
    )
    .join("\n\n");

  const summaryPrompt = `你是项目主管，请汇总下属的工作成果。

## 用户原始需求
${userRequest}

## 下属产出
${workerOutputs}

请给出：
1. 任务完成情况总结
2. 最终的综合回答（整合所有下属的产出）
3. 如果有未完成的部分，说明原因`;

  const finalOutput = await supervisor.execute(summaryPrompt);
  results.push({
    taskDescription: "主管汇总",
    agentName: supervisor.profile.name,
    output: finalOutput,
    duration: Date.now() - startTime,
    status: "completed",
  });

  console.log(`   ✅ 主管汇总完成`);
  console.log("   ".repeat(40));
  console.log(`👑 Supervisor 模式完成 (${Date.now() - startTime}ms)`);

  return {
    results,
    totalDuration: Date.now() - startTime,
    mode: "supervisor",
  };
}

// ============================================================
// 🎮 Crew 类：统一的团队编排入口
// ============================================================

/**
 * Crew 类 - 团队编排的统一入口
 *
 * 【用法】
 * ```typescript
 * const crew = new Crew("内容创作团队");
 * crew.addAgent(researcher);
 * crew.addAgent(writer);
 * crew.addAgent(reviewer);
 *
 * // 顺序执行
 * const result = await crew.runSequential(tasks);
 *
 * // 主管模式
 * const result = await crew.runSupervisor(supervisor, request);
 * ```
 */
export class Crew {
  public name: string;
  public agents: AgentInstance[] = [];

  constructor(name: string) {
    this.name = name;
  }

  /**
   * 添加 Agent 到团队
   */
  addAgent(agent: AgentInstance): this {
    this.agents.push(agent);
    return this;
  }

  /**
   * 顺序执行
   */
  async runSequential(tasks: Task[]): Promise<CrewResult> {
    return executeSequential(tasks);
  }

  /**
   * 并行执行
   */
  async runParallel(tasks: Task[]): Promise<CrewResult> {
    return executeParallel(tasks);
  }

  /**
   * 主管模式执行
   */
  async runSupervisor(
    supervisor: AgentInstance,
    userRequest: string
  ): Promise<CrewResult> {
    return executeSupervisor(supervisor, this.agents, userRequest);
  }
}

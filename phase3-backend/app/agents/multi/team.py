"""
Multi-Agent Team - Collaboration Patterns
Sequential: Worker -> Writer -> Reviewer
Parallel: Multiple Workers at same time
Supervisor: Supervisor assigns tasks
GroupChat: Agents discuss in rounds
"""
import asyncio
import json
import re
from typing import AsyncGenerator
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage
from app.core.config import settings


class AgentProfile:
    # 每个 Agent 的“人设/职责”描述：
    # - name: 显示名（Researcher/Writer/Reviewer）
    # - role: 角色名（本示例未深度使用，主要用于可读性）
    # - system_prompt: 写进 SystemMessage，影响模型行为
    def __init__(self, name: str, role: str, system_prompt: str):
        self.name = name
        self.role = role
        self.system_prompt = system_prompt


PROFILES = {
    "researcher": AgentProfile("Researcher", "Researcher", "You are a professional researcher."),
    "writer": AgentProfile("Writer", "Writer", "You are a professional writer."),
    "reviewer": AgentProfile("Reviewer", "Reviewer", "You are a professional reviewer."),
    "coder": AgentProfile("Coder", "Coder", "You are a professional coder."),
}


class WorkerAgent:
    def __init__(self, profile: AgentProfile):
        self.profile = profile
        # 每个 worker 都是一个独立的 ChatOpenAI 实例（便于不同温度/模型/提示词）
        self.llm = ChatOpenAI(model=settings.OPENAI_MODEL, api_key=settings.OPENAI_API_KEY, base_url=settings.OPENAI_BASE_URL, temperature=0.7)

    async def execute(self, task: str) -> str:
        # 统一执行入口：SystemMessage(人设) + HumanMessage(任务)
        messages = [SystemMessage(content=self.profile.system_prompt), HumanMessage(content=task)]
        resp = await self.llm.ainvoke(messages)
        return str(resp.content)


class MultiAgentTeam:
    def __init__(self, mode: str):
        self.mode = mode
        self.workers = {}
        # supervisor_llm 用于“分派任务/规划”类提示，本示例用简单 JSON 解析
        self.supervisor_llm = ChatOpenAI(model=settings.OPENAI_MODEL, api_key=settings.OPENAI_API_KEY, base_url=settings.OPENAI_BASE_URL, temperature=0.7)

    def add_worker(self, profile: AgentProfile):
        self.workers[profile.name] = WorkerAgent(profile)

    async def execute_sequential(self, topic: str) -> AsyncGenerator:
        # 顺序模式：Researcher -> Writer -> Reviewer
        # 产出的 chunk 类型（供 API/Web UI 渲染）：
        # - agent_start / agent_thinking / agent_done / summary
        self.add_worker(PROFILES["researcher"])
        self.add_worker(PROFILES["writer"])
        self.add_worker(PROFILES["reviewer"])

        yield {"type": "agent_start", "content": f"Sequential Mode: {topic}"}

        yield {"type": "agent_thinking", "content": "Researcher analyzing..."}
        research = await self.workers["Researcher"].execute(f"Research: {topic}")
        yield {"type": "agent_done", "content": "Research complete"}

        yield {"type": "agent_thinking", "content": "Writer creating..."}
        writer = await self.workers["Writer"].execute(f"Based on research:\n{research}\n\nWrite about: {topic}")
        yield {"type": "agent_done", "content": "Writing complete"}

        yield {"type": "agent_thinking", "content": "Reviewer evaluating..."}
        review = await self.workers["Reviewer"].execute(f"Review:\n{writer}")
        yield {"type": "agent_done", "content": "Review complete"}

        yield {"type": "summary", "content": f"=== Research ===\n{research}\n\n=== Written ===\n{writer}\n\n=== Review ===\n{review}"}

    async def execute_parallel(self, topic: str) -> AsyncGenerator:
        # 并行模式：同时跑多个 worker，最后汇总
        # - task_result: 中间过程（为了 UI 不刷屏，做了截断）
        # - summary: 完整内容
        self.add_worker(PROFILES["researcher"])
        self.add_worker(PROFILES["writer"])
        self.add_worker(PROFILES["reviewer"])

        yield {"type": "agent_start", "content": f"Parallel Mode: {topic}"}

        tasks = [
            ("Researcher", f"Research {topic} from technical perspective"),
            ("Writer", f"Write about {topic} from business angle"),
            ("Reviewer", f"Analyze {topic} from user perspective"),
        ]

        results = await asyncio.gather(*[self.workers[n].execute(t) for n, t in tasks])

        for (name, _), output in zip(tasks, results):
            yield {"type": "task_result", "content": f"【{name}】\n{output[:200]}..."}

        yield {"type": "summary", "content": "\n\n".join([f"【{n}】\n{o}" for (n, _), o in zip(tasks, results)])}

    async def execute_supervisor(self, topic: str) -> AsyncGenerator:
        # 主管模式：先让 supervisor_llm 产出“任务分解”，再让 worker 执行
        # 为了教学简单，这里用正则从模型输出中提取 JSON（不保证绝对可靠）
        self.add_worker(PROFILES["researcher"])
        self.add_worker(PROFILES["writer"])
        self.add_worker(PROFILES["reviewer"])

        yield {"type": "agent_start", "content": f"Supervisor Mode: {topic}"}

        yield {"type": "agent_thinking", "content": "Supervisor analyzing..."}
        prompt = f"Analyze: {topic}\nWorkers: Researcher, Writer, Reviewer\nOutput JSON format."
        resp = await self.supervisor_llm.ainvoke([HumanMessage(content=prompt)])
        
        match = re.search(r'\{.*\}', str(resp.content), re.DOTALL)
        tasks = []
        if match:
            try:
                tasks = json.loads(match.group()).get("tasks", [])
            except:
                pass

        if not tasks:
            tasks = [{"assignee": "Researcher", "task": f"Research: {topic}"}, {"assignee": "Writer", "task": f"Write: {topic}"}]

        results = []
        for task in tasks:
            assignee = task.get("assignee", "")
            if assignee not in self.workers:
                continue
            yield {"type": "agent_thinking", "content": f"{assignee} working..."}
            output = await self.workers[assignee].execute(task.get("task", ""))
            results.append({"agent": assignee, "output": output})
            yield {"type": "agent_done", "content": f"{assignee} complete"}

        yield {"type": "summary", "content": "\n\n".join([f"【{r['agent']}】\n{r['output']}" for r in results])}

    async def execute_groupchat(self, topic: str) -> AsyncGenerator:
        # 群聊模式：让多个 agent 轮流发言 N 轮，把上下文不断追加
        # 真实项目中建议：
        # - 控制上下文长度（摘要/裁剪）
        # - 引入“主持人/经理”选择发言者与终止条件
        self.add_worker(PROFILES["researcher"])
        self.add_worker(PROFILES["writer"])
        self.add_worker(PROFILES["reviewer"])

        yield {"type": "agent_start", "content": f"GroupChat Mode: {topic}"}

        context = f"Topic: {topic}\n\n"
        for _ in range(3):
            for name, worker in self.workers.items():
                yield {"type": "agent_thinking", "content": f"{name} speaking..."}
                output = await worker.execute(f"{context}\nPlease share your view.")
                context += f"{name}: {output}\n"
                yield {"type": "task_result", "content": f"【{name}】: {output[:150]}..."}

        yield {"type": "summary", "content": f"Discussion:\n{context}"}

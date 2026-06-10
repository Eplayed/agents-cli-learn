// M9 — RAG + 长期记忆

export default {
  id: 'M9',
  topic: 'RAG 检索增强',
  title: '让 Agent 基于知识库回答',
  subtitle: '向量检索 / ChromaDB / chunking / embedding / 引用标注',

  stages: [
    {
      kind: 'story',
      title: '为什么 Agent 需要知识库？',
      content: `
        <p>LLM 的知识有两个致命问题：</p>
        <div class="story-box">
          <ul>
            <li><strong>过时</strong>：训练数据有截止日期，不知道最新信息</li>
            <li><strong>不知道你的私有数据</strong>：公司文档、产品手册、你的代码库</li>
          </ul>
        </div>

        <p><strong>RAG = Retrieval-Augmented Generation = 检索增强生成</strong></p>
        <p>核心思路：回答前先"查资料"，基于真实数据回答，不靠背。</p>

        <div class="story-box">
          🎯 本关你将掌握：
          <ul>
            <li>RAG 6 步流程（切块→向量化→存储→检索→注入→生成）</li>
            <li>ChromaDB 本地向量数据库</li>
            <li>Embedding 是什么</li>
            <li>怎么在回答里标注引用来源</li>
          </ul>
        </div>
      `,
    },

    {
      kind: 'concept',
      title: 'RAG 6 步流程',
      content: `
        <h3>📌 整体流程</h3>
        <pre>离线（建索引）：文档 → Chunk → Embedding → 向量库
在线（每次查询）：问题 → Embedding → 检索 → 注入上下文 → LLM 生成回答</pre>

        <h3>📌 每步做什么</h3>
        <table class="compare-table">
          <thead><tr><th>步骤</th><th>做什么</th><th>工具</th></tr></thead>
          <tbody>
            <tr><td>1. Chunking</td><td>把长文档切成 800 字的小块</td><td>RecursiveCharacterTextSplitter</td></tr>
            <tr><td>2. Embedding</td><td>文本块 → 向量（数字数组）</td><td>all-MiniLM-L6-v2（本地免费）</td></tr>
            <tr><td>3. Store</td><td>向量存入数据库</td><td>ChromaDB（本地文件）</td></tr>
            <tr><td>4. Query</td><td>用户问题 → 向量 → 检索最相似的块</td><td>cosine similarity</td></tr>
            <tr><td>5. Inject</td><td>检索结果塞进 LLM 的 system prompt</td><td>format_rag_context()</td></tr>
            <tr><td>6. Generate</td><td>LLM 基于检索结果生成回答</td><td>ChatOpenAI</td></tr>
          </tbody>
        </table>

        <h3>📌 Embedding 是什么？</h3>
        <p>把文字变成"数字坐标"，让计算机能算"两段话有多像"：</p>
        <pre>"上海天气" → [0.12, -0.45, 0.78, ...]  (384 维向量)
"北京天气" → [0.11, -0.43, 0.76, ...]  ← 很接近！
"写一首诗" → [0.89, 0.23, -0.56, ...]  ← 很远</pre>

        <p>检索时：问题向量和所有块向量比"距离"，最近的就是最相关的。</p>

        <div class="callout">
          💡 本项目用 <code>all-MiniLM-L6-v2</code>（本地小模型，90MB，不花钱）。
          生产环境可以换 OpenAI 的 <code>text-embedding-3-small</code>（更准但要付费）。
        </div>
      `,
    },

    {
      kind: 'build',
      title: '搭建：项目里的 RAG 实现',
      content: `
        <p>你项目里的知识库 = <code>docs/*.md</code>（架构图、学习计划、MCP 文档等）。</p>

        <pre data-lang="python"><code># app/core/rag.py 核心逻辑

# 1. 加载文档
docs = DirectoryLoader("docs/", glob="**/*.md").load()

# 2. 切块
chunks = RecursiveCharacterTextSplitter(
    chunk_size=800, chunk_overlap=100
).split_documents(docs)

# 3. 向量化 + 存储
vectorstore = Chroma.from_documents(
    chunks,
    embedding=HuggingFaceEmbeddings("all-MiniLM-L6-v2"),
    persist_directory="rag_db/",
)

# 4. 检索
retriever = vectorstore.as_retriever(search_kwargs={"k": 3})
docs = await retriever.ainvoke("什么是 MCP")

# 5. 注入
context = format_rag_context(docs)
# → "[1] 来源: MCP-INTEGRATION.md\\n MCP 是..."

# 6. 生成（在 system prompt 里）
"请基于以上内容回答，并标注引用编号如 [1][2]"</code></pre>

        <h3>📌 怎么体验</h3>
        <p>切到 <strong>M9 · RAG Agent</strong> 模式，问项目相关的问题：</p>
        <ul>
          <li>"什么是 MCP 协议"</li>
          <li>"LangGraph 的图结构怎么画"</li>
          <li>"项目有几种 Agent 模式"</li>
        </ul>
        <p>你会看到 [RAG 检索] 事件 + 带引用标号 [1][2] 的回答。</p>

        <div class="callout">
          🔍 <strong>首次启动会稍慢</strong>（下载 embedding 模型 + 建索引）。
          后续启动直接从 <code>rag_db/</code> 加载，很快。
        </div>
      `,
    },

    {
      kind: 'final-quiz',
      title: '通关测验：M9 RAG',
      passLine: 0.8,
      questions: [
        {
          id: 'm9fq1',
          type: 'order',
          knowledgeTag: 'RAG',
          text: '把 RAG 的流程按正确顺序排好',
          items: [
            { id: 'chunk', text: 'Chunking：长文档切成小块' },
            { id: 'embed', text: 'Embedding：文本块 → 向量' },
            { id: 'store', text: 'Store：向量存入数据库' },
            { id: 'query', text: 'Query：用户问题 → 向量 → 检索相似块' },
            { id: 'inject', text: 'Inject：检索结果注入 LLM 上下文' },
            { id: 'generate', text: 'Generate：LLM 生成回答' },
          ],
          answer: ['chunk', 'embed', 'store', 'query', 'inject', 'generate'],
          explain: '前 3 步是离线（建索引），后 3 步是在线（每次查询）。',
        },
        {
          id: 'm9fq2',
          type: 'single',
          knowledgeTag: 'RAG',
          text: 'Embedding 的作用是什么？',
          options: [
            { text: '压缩文件大小', value: 'a' },
            { text: '把文本转成向量（数字数组），让计算机能计算"两段话有多相似"', value: 'b' },
            { text: '加密文本', value: 'c' },
            { text: '翻译成英文', value: 'd' }
          ],
          answer: 'b',
          explain: 'Embedding = 文本的"数字指纹"。相似的文本，向量距离近；不相关的文本，向量距离远。',
        },
        {
          id: 'm9fq3',
          type: 'single',
          knowledgeTag: 'RAG',
          text: '为什么 RAG 比让 LLM 直接回答更可靠？',
          options: [
            { text: 'RAG 更快', value: 'a' },
            { text: 'RAG 基于真实文档回答并能标注来源，LLM 直接回答可能幻觉（编造不存在的信息）', value: 'b' },
            { text: 'RAG 不需要 LLM', value: 'c' },
            { text: 'RAG 更便宜', value: 'd' }
          ],
          answer: 'b',
          explain: 'RAG 的核心价值 = 可溯源。回答有出处，用户能验证。LLM 直接回答可能编造"看起来对但实际错"的内容。',
        },
      ]
    }
  ]
};

"""
RAG 模块（M9）— 检索增强生成

把项目 docs/ 目录下的 .md 文件作为知识库，支持语义检索。
Agent 回答时可以引用知识库中的内容。

流程：
1. 首次启动：读 docs/*.md → 切块 → embedding → 存入 ChromaDB
2. 用户提问：问题 → embedding → 检索相似块 → 注入 LLM 上下文
3. LLM 基于检索结果回答 + 标注来源

使用方式：
    from app.core.rag import get_rag_retriever, format_rag_context

    retriever = get_rag_retriever()
    docs = await retriever.ainvoke("什么是 MCP")
    context = format_rag_context(docs)
"""
from pathlib import Path
from typing import List, Optional

# 全局 retriever 缓存
_RETRIEVER = None


def _get_docs_path() -> Path:
    """获取知识库目录路径"""
    return Path(__file__).resolve().parent.parent.parent.parent / "docs"


def _load_documents() -> list:
    """加载所有 .md 文件"""
    from langchain_community.document_loaders import DirectoryLoader, TextLoader

    docs_path = _get_docs_path()
    if not docs_path.exists():
        return []

    loader = DirectoryLoader(
        str(docs_path),
        glob="**/*.md",
        loader_cls=TextLoader,
        loader_kwargs={"encoding": "utf-8"},
    )
    return loader.load()


def _split_documents(docs: list) -> list:
    """切分文档为小块"""
    from langchain_text_splitters import RecursiveCharacterTextSplitter

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=800,      # 每块约 800 字符
        chunk_overlap=100,   # 相邻块重叠 100 字符（保证上下文连贯）
        separators=["\n## ", "\n### ", "\n---", "\n\n", "\n", " "],
    )
    return splitter.split_documents(docs)


def build_vectorstore():
    """构建向量数据库（首次调用时执行，后续从持久化加载）"""
    import chromadb
    from langchain_chroma import Chroma
    from chromadb.utils.embedding_functions import DefaultEmbeddingFunction

    persist_dir = str(Path(__file__).resolve().parent.parent.parent / "rag_db")

    # 如果已经有持久化数据，直接加载
    if Path(persist_dir).exists() and any(Path(persist_dir).iterdir()):
        vectorstore = Chroma(
            persist_directory=persist_dir,
            collection_name="agent_docs",
            embedding_function=_get_embedding_function(),
        )
        return vectorstore

    # 首次：加载文档 → 切块 → 存入
    docs = _load_documents()
    if not docs:
        return None

    chunks = _split_documents(docs)
    if not chunks:
        return None

    vectorstore = Chroma.from_documents(
        documents=chunks,
        embedding=_get_embedding_function(),
        persist_directory=persist_dir,
        collection_name="agent_docs",
    )
    return vectorstore


def _get_embedding_function():
    """获取 embedding 函数（使用 ChromaDB 内置的免费模型，不需要 OpenAI key）"""
    from langchain_chroma import Chroma
    from langchain.embeddings import HuggingFaceEmbeddings

    # 用本地小模型做 embedding（不花钱，不需要 API key）
    # 首次运行会下载模型（约 90MB）
    try:
        return HuggingFaceEmbeddings(
            model_name="sentence-transformers/all-MiniLM-L6-v2",
            model_kwargs={"device": "cpu"},
        )
    except Exception:
        # 如果 HuggingFace 模型下载失败，用 Chroma 默认的
        from chromadb.utils.embedding_functions import DefaultEmbeddingFunction
        return DefaultEmbeddingFunction()


def get_rag_retriever(top_k: int = 3):
    """获取 RAG 检索器（单例）"""
    global _RETRIEVER
    if _RETRIEVER is not None:
        return _RETRIEVER

    try:
        vectorstore = build_vectorstore()
        if vectorstore is None:
            return None
        _RETRIEVER = vectorstore.as_retriever(search_kwargs={"k": top_k})
        return _RETRIEVER
    except Exception as e:
        print(f"[RAG] 构建向量库失败: {e}")
        return None


def format_rag_context(docs: list) -> str:
    """把检索到的文档块格式化为上下文字符串（带来源标注）"""
    if not docs:
        return ""

    parts = ["--- 以下是从知识库检索到的相关内容 ---"]
    for i, doc in enumerate(docs, 1):
        source = Path(doc.metadata.get("source", "未知")).name
        content = doc.page_content[:500]  # 每块最多 500 字符
        parts.append(f"\n[{i}] 来源: {source}\n{content}")
    parts.append("\n--- 请基于以上内容回答，并标注引用编号 [1][2] ---")
    return "\n".join(parts)

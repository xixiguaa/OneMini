"""FastEmbed → LangChain Embeddings 适配层。"""

from langchain_core.embeddings import Embeddings

from app.services.embeddings import embed_texts


class FastEmbedEmbeddings(Embeddings):
    """复用现有 fastembed 模型，供 langchain-milvus 向量库使用。"""

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return embed_texts(texts)

    def embed_query(self, text: str) -> list[float]:
        vecs = embed_texts([text])
        if not vecs:
            raise RuntimeError("嵌入模型未返回向量")
        return vecs[0]

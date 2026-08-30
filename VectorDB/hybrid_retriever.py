from typing import List, Callable, Optional, Tuple, Any
import numpy as np

from Retrieval.sparse_retrieval import SparseRetriever
from Embedding.semantic_embedding import generate_embeddings
import logging

logger = logging.getLogger("retrieval.hybrid")


class HybridRetriever:
    """Hybrid retriever combining sparse (BM25) and dense (semantic embedding) search.

    Parameters:
      sparse_weight: weight for sparse retrieval scores (0.0 to 1.0).
      dense_weight: weight for dense retrieval scores (0.0 to 1.0).
      embedding_model: the name of the embedding model to use (default: "all-MiniLM-L6-v2").
      stopwords: stopwords for tokenization ('en' or custom set).
      stemmer: optional stemming function.
    """

    def __init__(
        self,
        sparse_weight: float = 0.5,
        dense_weight: float = 0.5,
        embedding_model: str = "all-MiniLM-L6-v2",
        stopwords: Optional[Any] = "en",
        stemmer: Optional[Callable[[str], str]] = None,
    ):
        if not (0.0 <= sparse_weight <= 1.0) or not (0.0 <= dense_weight <= 1.0):
            raise ValueError("Weights must be between 0.0 and 1.0")

        self.sparse_weight = sparse_weight
        self.dense_weight = dense_weight
        self.embedding_model = embedding_model

        self._sparse_retriever = SparseRetriever(stopwords=stopwords, stemmer=stemmer)
        self._dense_embeddings = None
        self._embedding_fn: Optional[Callable] = None
        self._raw_docs = []

    def _ensure_text(self, item: Any) -> str:
        """Extract text from various document types."""
        if isinstance(item, str):
            return item
        if hasattr(item, "page_content"):
            return getattr(item, "page_content") or ""
        if hasattr(item, "content"):
            return getattr(item, "content") or ""
        return str(item)

    def index(
        self,
        docs: List[Any],
        chunking_fn: Optional[Callable] = None,
        embedding_fn: Optional[Callable] = None,
    ):
        """Index documents using both sparse and dense approaches.

        Parameters:
          docs: list of documents (strings or objects with page_content/content).
          chunking_fn: optional chunking function to apply before indexing.
          embedding_fn: optional custom embedding function. If None, uses configured model.
        """
        # Apply chunking if provided
        if chunking_fn:
            items = chunking_fn(docs)
        else:
            items = docs

        # Extract text from all items
        texts = [self._ensure_text(i) for i in items]
        self._raw_docs = texts

        # Index with sparse retriever
        self._sparse_retriever.index(texts)
        logger.info("Hybrid retriever: sparse index completed for %d docs", len(texts))

        # Generate dense embeddings and remember embedding function (if custom)
        if embedding_fn:
            embeddings = embedding_fn(texts)
            self._embedding_fn = embedding_fn
        else:
            embeddings = generate_embeddings(texts, model_name=self.embedding_model)
            self._embedding_fn = None

        self._dense_embeddings = embeddings
        logger.info("Hybrid retriever: dense embeddings shape %s", str(getattr(self._dense_embeddings, 'shape', None)))

    def _dense_retrieve(self, query: str, k: int = 5) -> Tuple[np.ndarray, np.ndarray]:
        """Retrieve using dense embeddings (semantic similarity)."""
        if self._dense_embeddings is None or len(self._raw_docs) == 0:
            return np.empty((1, 0), dtype=object), np.empty((1, 0), dtype=float)

        # Use the same embedding function used at index time (if any)
        if self._embedding_fn is not None:
            query_embedding = self._embedding_fn([query])
        else:
            query_embedding = generate_embeddings([query], model_name=self.embedding_model)
        if query_embedding.shape[0] == 0:
            return np.empty((1, 0), dtype=object), np.empty((1, 0), dtype=float)

        # Compute cosine similarities
        query_vec = query_embedding[0]
        scores = []

        for doc_vec in self._dense_embeddings:
            dot_product = np.dot(query_vec, doc_vec)
            norm_q = np.linalg.norm(query_vec)
            norm_d = np.linalg.norm(doc_vec)

            if np.isclose(norm_q * norm_d, 0.0):
                similarity = 0.0
            else:
                similarity = float(dot_product / (norm_q * norm_d))

            scores.append(similarity)

        scores = np.array(scores, dtype=float)

        # Get top-k
        top_idx = np.argsort(-scores)[:k]
        top_scores = scores[top_idx]
        top_docs = [self._raw_docs[i] for i in top_idx]

        return np.array([top_docs], dtype=object), np.array([top_scores], dtype=float)

    def retrieve(self, query: str, k: int = 5) -> Tuple[List[str], List[float]]:
        """Retrieve top-k documents using hybrid sparse + dense ranking.

        Parameters:
          query: free-text query string.
          k: number of top results to return.

        Returns:
          results: list of document texts.
          scores: list of combined hybrid scores.
        """
        if len(self._raw_docs) == 0:
            return [], []

        # Get sparse results (normalized to [0, 1])
        sparse_results, sparse_scores = self._sparse_retriever.retrieve(query, k=len(self._raw_docs))
        if sparse_results.shape[1] > 0:
            sparse_scores_flat = sparse_scores[0]
            max_sparse = np.max(sparse_scores_flat) if np.max(sparse_scores_flat) > 0 else 1.0
            sparse_scores_normalized = sparse_scores_flat / max_sparse
        else:
            sparse_scores_normalized = np.array([])

        # Get dense results (already in [0, 1] for cosine similarity)
        dense_results, dense_scores = self._dense_retrieve(query, k=len(self._raw_docs))
        if dense_results.shape[1] > 0:
            dense_scores_flat = dense_scores[0]
            max_dense = np.max(dense_scores_flat) if np.max(dense_scores_flat) > 0 else 1.0
            dense_scores_normalized = dense_scores_flat / max_dense
        else:
            dense_scores_normalized = np.array([])

        # Align scores by document index
        all_docs = set(self._raw_docs)
        combined_scores = {}

        for idx, doc in enumerate(self._raw_docs):
            score = 0.0
            if idx < len(sparse_scores_normalized):
                score += self.sparse_weight * sparse_scores_normalized[idx]
            if idx < len(dense_scores_normalized):
                score += self.dense_weight * dense_scores_normalized[idx]
            combined_scores[doc] = score

        # Sort by combined score
        sorted_docs = sorted(combined_scores.items(), key=lambda x: x[1], reverse=True)
        top_k_docs = sorted_docs[:k]

        results = [doc for doc, _ in top_k_docs]
        scores = [score for _, score in top_k_docs]

        return results, scores


if __name__ == "__main__":
    # Demo: hybrid retrieval on a sample corpus
    corpus = [
        "Data engineering relies heavily on robust ETL pipelines.",
        "Astronomy studies planets, stars, and celestial galaxies.",
        "Deep learning models require powerful GPUs and massive compute.",
        "Python is popular for data analysis and machine learning tasks.",
    ]

    print("Initializing HybridRetriever...")
    retriever = HybridRetriever(sparse_weight=0.6, dense_weight=0.4)
    retriever.index(corpus)

    query = "Tell me about space, stars, and planets"
    print(f"\nQuery: {query}\n")

    results, scores = retriever.retrieve(query, k=2)

    for rank, (doc, score) in enumerate(zip(results, scores), 1):
        print(f"Rank {rank} (Score: {score:.4f}): {doc}")

    print("\n" + "=" * 80)

    query2 = "computational methods for machine learning"
    print(f"\nQuery: {query2}\n")

    results2, scores2 = retriever.retrieve(query2, k=2)

    for rank, (doc, score) in enumerate(zip(results2, scores2), 1):
        print(f"Rank {rank} (Score: {score:.4f}): {doc}")

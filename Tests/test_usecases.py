try:
    import pytest
except ImportError:
    pytest = None
import numpy as np

from pathlib import Path
import sys
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from PreProcessing.semantic_preprocessing import segment_sentences
from Embedding.semantic_embedding import generate_embeddings
from Retrieval.sparse_retrieval import SparseRetriever
from VectorDB.hybrid_retriever import HybridRetriever


class DummyPage:
    def __init__(self, text, meta=None):
        self.page_content = text
        self.metadata = meta or {}


def test_segment_sentences_basic():
    text = "This is one. Here is two! And the third?"
    sents = segment_sentences(text)
    assert isinstance(sents, list)
    assert len(sents) == 3


def test_generate_embeddings_empty_and_nonempty():
    empty = generate_embeddings([])
    assert isinstance(empty, np.ndarray)
    assert empty.size == 0

    texts = ["hello world", "another sentence"]
    emb = generate_embeddings(texts)
    assert isinstance(emb, np.ndarray)
    assert emb.shape[0] == 2


def test_fixed_recursive_structural_chunkers():
    # Use simple pages
    pages = [DummyPage("A " * 1200), DummyPage("B " * 800)]

    from Chunking.fixed_size_chunking import fixed_size_chunking
    from Chunking.recursive_chunking import recursive_size_chunking
    from Chunking.structural_chunking import structural_chunking

    fixed_chunks = fixed_size_chunking(pages, chunk_size=500, chunk_overlap=50)
    assert len(fixed_chunks) > 0

    rec_chunks = recursive_size_chunking(pages, chunk_size=500, chunk_overlap=50)
    assert len(rec_chunks) > 0

    # structural expects headings; give sample text
    pages2 = [DummyPage("INTRODUCTION\nThis is intro.\nCONCLUSION\nDone.")]
    struct_chunks = structural_chunking(pages2)
    assert len(struct_chunks) >= 1


def test_semantic_chunking_returns_list():
    from Chunking.semantic_chunking import semantic_chunking

    text = "Sentence one. Sentence two is different. Third sentence follows." * 2
    chunks = semantic_chunking(text, model_name="nonexistent-model-to-force-fallback")
    assert isinstance(chunks, list)
    assert len(chunks) > 0


def test_sparse_retriever_basic():
    corpus = [
        "Python programming and data",
        "Astronomy and stars",
        "Data engineering and ETL",
    ]

    retriever = SparseRetriever(stopwords=None)
    retriever.index(corpus)

    results, scores = retriever.retrieve("data", k=2)
    assert len(results) == 1
    assert len(results[0]) == 2
    # top result should mention 'data'
    assert "data" in results[0][0].lower()


def test_hybrid_retriever_dense_prefers_embedding():
    # Two docs with orthogonal dense embeddings
    docs = ["doc A content", "doc B content"]

    def embedding_fn(texts):
        # create simple 2D embeddings: doc0 -> [1,0], doc1 -> [0,1]
        embs = []
        for t in texts:
            if "A" in t or "A" in t.upper():
                embs.append([1.0, 0.0])
            else:
                embs.append([0.0, 1.0])
        return np.array(embs, dtype=float)

    retriever = HybridRetriever(sparse_weight=0.0, dense_weight=1.0)
    retriever.index(docs, embedding_fn=embedding_fn)

    results, scores = retriever.retrieve("A query", k=1)
    assert results[0] == "doc A content"


if __name__ == "__main__":
    print("Running test_segment_sentences_basic...")
    test_segment_sentences_basic()
    print("Running test_generate_embeddings_empty_and_nonempty...")
    test_generate_embeddings_empty_and_nonempty()
    print("Running test_fixed_recursive_structural_chunkers...")
    test_fixed_recursive_structural_chunkers()
    print("Running test_semantic_chunking_returns_list...")
    test_semantic_chunking_returns_list()
    print("Running test_sparse_retriever_basic...")
    test_sparse_retriever_basic()
    print("Running test_hybrid_retriever_dense_prefers_embedding...")
    test_hybrid_retriever_dense_prefers_embedding()
    print("All tests PASSED successfully!")

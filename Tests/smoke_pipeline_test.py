import sys
import logging
from pathlib import Path

# Make repo root importable
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from config import load_config
from Ingestion.pdf_ingestion import load_pdf_pages
from PreProcessing.semantic_preprocessing import segment_sentences
from Embedding.semantic_embedding import generate_embeddings, _simple_bag_of_words_embeddings

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("smoke_test")


def _ensure_text(item):
    if isinstance(item, str):
        return item
    if hasattr(item, "page_content"):
        return getattr(item, "page_content") or ""
    if hasattr(item, "content"):
        return getattr(item, "content") or ""
    return str(item)


def run_smoke():
    cfg = load_config()
    logger.info("Running smoke test with config: %s", cfg)

    pages = load_pdf_pages(cfg["pdf_path"])  # may raise; that's OK for smoke

    if cfg.get("preprocess", True):
        logger.info("Preprocessing pages (sentence segmentation)")
        for p in pages:
            p.page_content = " ".join(segment_sentences(p.page_content or ""))

    # Chunking
    chunking = cfg.get("chunking", "semantic")
    chunk_texts = []

    if chunking == "semantic":
        from Chunking.semantic_chunking import semantic_chunking as _semantic_chunking

        full_text = "\n".join(_ensure_text(p) for p in pages)
        chunk_texts = _semantic_chunking(full_text, model_name=cfg.get("embedding_model"))
    elif chunking == "fixed":
        from Chunking.fixed_size_chunking import fixed_size_chunking as _fixed

        chunks = _fixed(pages, chunk_size=cfg.get("chunk_size", 500), chunk_overlap=cfg.get("chunk_overlap", 50))
        chunk_texts = [_ensure_text(c) for c in chunks]
    elif chunking == "recursive":
        from Chunking.recursive_chunking import recursive_size_chunking as _recursive

        chunks = _recursive(pages, chunk_size=cfg.get("chunk_size", 500), chunk_overlap=cfg.get("chunk_overlap", 50))
        chunk_texts = [_ensure_text(c) for c in chunks]
    elif chunking == "structural":
        from Chunking.structural_chunking import structural_chunking as _structural

        chunks = _structural(pages)
        chunk_texts = [_ensure_text(c) for c in chunks]
    else:
        chunk_texts = [_ensure_text(p) for p in pages]

    logger.info("Prepared %d chunks/items for indexing", len(chunk_texts))

    # Embeddings and retriever
    retriever_choice = cfg.get("retriever", "hybrid")

    if retriever_choice == "sparse":
        from Retrieval.sparse_retrieval import SparseRetriever

        retriever = SparseRetriever()
        retriever.index(chunk_texts)
        query_fn = lambda q, k=cfg.get("k", 5): retriever.retrieve(q, k=k)
    else:
        from VectorDB.hybrid_retriever import HybridRetriever

        def embedding_fn(texts):
            if cfg.get("embedding_model") == "bag_of_words":
                return _simple_bag_of_words_embeddings(texts)
            return generate_embeddings(texts, model_name=cfg.get("embedding_model"))

        retriever = HybridRetriever()
        retriever.index(chunk_texts, embedding_fn=embedding_fn)
        query_fn = lambda q, k=cfg.get("k", 5): retriever.retrieve(q, k=k)

    # Run sample query
    sample_query = "What is this document about?"
    logger.info("Running sample query: %s", sample_query)
    results, scores = query_fn(sample_query, k=cfg.get("k", 5))

    # Normalize numpy array shapes to plain lists for printing
    try:
        import numpy as _np
    except Exception:
        _np = None

    if _np is not None and hasattr(results, "ndim") and results.ndim > 1:
        results_list = list(results[0])
    else:
        results_list = list(results) if isinstance(results, (list, tuple)) else [results]

    if _np is not None and hasattr(scores, "ndim") and scores.ndim > 1:
        scores_list = list(scores[0])
    else:
        scores_list = list(scores) if isinstance(scores, (list, tuple)) else [scores]

    logger.info("Query returned %d results", len(results_list))
    for i, (r, s) in enumerate(zip(results_list, scores_list), start=1):
        try:
            score_val = float(s)
        except Exception:
            score_val = 0.0
        print(f"Result {i} (score={score_val:.4f}):\n{r}\n---")


if __name__ == "__main__":
    run_smoke()

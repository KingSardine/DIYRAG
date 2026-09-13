import os
import sys
import time
import logging
from pathlib import Path
from typing import List, Dict, Any, Tuple, Optional, Callable

# Ensure project root is in sys.path
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from Ingestion.pdf_ingestion import load_pdf_pages
from PreProcessing.semantic_preprocessing import segment_sentences
from Embedding.semantic_embedding import generate_embeddings, _simple_bag_of_words_embeddings
from Retrieval.sparse_retrieval import SparseRetriever
from VectorDB.hybrid_retriever import HybridRetriever
from config import load_config, save_config

logger = logging.getLogger("pipeline.service")

# Global pipeline state cache
_active_retriever = None
_active_query_fn = None
_active_chunks: List[str] = []
_active_pages_sample: List[str] = []
_active_config: Dict[str, Any] = {}
_last_stage_diagnostics: Dict[str, Any] = {}

def _ensure_text(item: Any) -> str:
    if isinstance(item, str):
        return item
    if hasattr(item, "page_content"):
        return getattr(item, "page_content") or ""
    if hasattr(item, "content"):
        return getattr(item, "content") or ""
    return str(item)

def execute_pipeline(config_dict: Dict[str, Any]) -> Dict[str, Any]:
    """Execute the DiyRAG pipeline stages sequentially with real-time log emissions and timing."""
    global _active_retriever, _active_query_fn, _active_chunks, _active_pages_sample, _active_config, _last_stage_diagnostics
    start_time = time.time()
    _active_config = dict(config_dict)

    pdf_path = config_dict.get("pdf_path", "ingestables/broadridge.pdf")
    chunking = config_dict.get("chunking", "recursive")
    preprocess = config_dict.get("preprocess", True)
    chunk_size = int(config_dict.get("chunk_size", 500))
    chunk_overlap = int(config_dict.get("chunk_overlap", 50))
    percentile_threshold = float(config_dict.get("percentile_threshold", 60.0))
    embedding_model = config_dict.get("embedding_model", "all-MiniLM-L6-v2")
    retriever_choice = config_dict.get("retriever", "hybrid")
    k = int(config_dict.get("k", 5))

    logger.info("Initializing Ingestion for: %s", pdf_path)
    t_ingest_start = time.time()

    # Stage 1: Ingestion
    resolved_path = pdf_path
    if not os.path.exists(resolved_path):
        candidate = os.path.join(str(ROOT), pdf_path)
        if os.path.exists(candidate):
            resolved_path = candidate
        else:
            raise FileNotFoundError(f"Document path '{pdf_path}' not found.")

    pages = load_pdf_pages(resolved_path)
    page_count = len(pages)
    total_chars = sum(len(_ensure_text(p)) for p in pages)
    ingest_duration_ms = max(1, int((time.time() - t_ingest_start) * 1000))
    
    # Store page sample
    _active_pages_sample = [_ensure_text(p)[:500] for p in pages[:3]]
    logger.info("Extracted %d pages. Total character count: %s.", page_count, f"{total_chars:,}")

    # Stage 2: Preprocessing
    if preprocess:
        logger.info("Preprocessing pages (sentence segmentation regex)...")
        for p in pages:
            try:
                p.page_content = " ".join(segment_sentences(p.page_content or ""))
            except Exception:
                pass

    # Stage 3: Chunking
    logger.info("Spawning chunker for strategy: %s (size=%d, overlap=%d)...", chunking, chunk_size, chunk_overlap)
    t_chunk_start = time.time()
    chunk_texts: List[str] = []

    if chunking == "semantic":
        from Chunking.semantic_chunking import semantic_chunking as _semantic_chunking
        full_text = "\n".join(_ensure_text(p) for p in pages)
        chunks = _semantic_chunking(full_text, model_name=embedding_model, percentile_threshold=percentile_threshold)
        chunk_texts = [c for c in chunks]
    elif chunking == "fixed":
        from Chunking.fixed_size_chunking import fixed_size_chunking as _fixed
        doc_chunks = _fixed(pages, chunk_size=chunk_size, chunk_overlap=chunk_overlap)
        chunk_texts = [_ensure_text(c) for c in doc_chunks]
    elif chunking == "recursive":
        from Chunking.recursive_chunking import recursive_size_chunking as _recursive
        doc_chunks = _recursive(pages, chunk_size=chunk_size, chunk_overlap=chunk_overlap)
        chunk_texts = [_ensure_text(c) for c in doc_chunks]
    elif chunking == "structural":
        from Chunking.structural_chunking import structural_chunking as _structural
        doc_chunks = _structural(pages)
        chunk_texts = [_ensure_text(c) for c in doc_chunks]
    else:
        chunk_texts = [_ensure_text(p) for p in pages]

    chunk_duration_ms = max(1, int((time.time() - t_chunk_start) * 1000))
    logger.info("Chunking completed. Created %d chunks.", len(chunk_texts))

    _active_chunks = chunk_texts

    # Stage 4: Embedding & Vector Indexing
    logger.info("Building embeddings with model '%s'...", embedding_model)
    t_embed_start = time.time()
    if embedding_model == "bag_of_words":
        embedding_fn = _simple_bag_of_words_embeddings
    else:
        embedding_fn = lambda texts: generate_embeddings(texts, model_name=embedding_model)

    # Stage 5: Retriever Indexing
    logger.info("Building %s retriever index for %d items...", retriever_choice.upper(), len(chunk_texts))
    if retriever_choice == "sparse":
        retriever = SparseRetriever()
        retriever.index(chunk_texts)

        def query_fn(q: str, top_k: int = 5):
            results, scores = retriever.retrieve(q, k=top_k)
            r_list = list(results[0]) if results.shape[1] > 0 else []
            s_list = list(scores[0]) if scores.shape[1] > 0 else []
            return r_list, s_list

        _active_retriever = retriever
        _active_query_fn = query_fn
    else:
        sparse_w = float(config_dict.get("sparse_weight", 0.5))
        dense_w = float(config_dict.get("dense_weight", 0.5))
        retriever = HybridRetriever(sparse_weight=sparse_w, dense_weight=dense_w, embedding_model=embedding_model)
        retriever.index(chunk_texts, embedding_fn=embedding_fn)

        def query_fn(q: str, top_k: int = 5):
            return retriever.retrieve(q, k=top_k)

        _active_retriever = retriever
        _active_query_fn = query_fn

    total_duration_ms = max(1, int((time.time() - start_time) * 1000))
    logger.info("Pipeline ready for queries! Total build time: %d ms", total_duration_ms)

    avg_chunk_size = int(sum(len(c) for c in chunk_texts) / max(1, len(chunk_texts)))

    # Store stage diagnostics
    _last_stage_diagnostics = {
        "pdf_path": pdf_path,
        "page_count": page_count,
        "total_chars": total_chars,
        "chunk_count": len(chunk_texts),
        "avg_chunk_size": avg_chunk_size,
        "page_1_sample": _active_pages_sample[0] if _active_pages_sample else "No content",
        "chunk_0_sample": chunk_texts[0][:400] if chunk_texts else "No chunks created",
        "embedding_model": embedding_model,
        "retriever": retriever_choice,
        "timings": {
            "ingest_ms": ingest_duration_ms,
            "chunk_ms": chunk_duration_ms,
            "total_ms": total_duration_ms,
        }
    }

    return {
        "success": True,
        "page_count": page_count,
        "total_chars": total_chars,
        "chunk_count": len(chunk_texts),
        "total_duration_ms": total_duration_ms,
        "diagnostics": _last_stage_diagnostics,
    }

def get_stage_diagnostics() -> Dict[str, Any]:
    global _last_stage_diagnostics
    if not _last_stage_diagnostics:
        try:
            execute_pipeline(load_config())
        except Exception as e:
            logger.exception("Failed to compute stage diagnostics")
            # Return a safe minimal diagnostics structure instead of raising
            return {
                "success": False,
                "error": "failed_to_compute_diagnostics",
                "details": str(e),
            }
    return _last_stage_diagnostics

def query_active_pipeline(query_text: str, k: int = 5, output_format: str = "snippet", snippet_length: int = 400) -> Dict[str, Any]:
    """Execute a query against the active indexed retriever."""
    global _active_query_fn, _active_chunks
    if _active_query_fn is None:
        execute_pipeline(load_config())

    t0 = time.time()
    results, scores = _active_query_fn(query_text, top_k=k)
    elapsed_ms = int((time.time() - t0) * 1000)

    formatted_results = []
    for rank, (doc, score) in enumerate(zip(results, scores), start=1):
        text = doc if output_format == "full" else doc[:snippet_length]
        formatted_results.append({
            "rank": rank,
            "chunk_id": f"chunk-{rank}",
            "doc": text,
            "score": float(score),
            "metadata": {
                "chunk_length": len(doc),
                "chunk_id": f"chunk-{rank}",
                "source_text": doc,
            },
        })

    logger.info("Query '%s' returned %d results in %d ms", query_text, len(formatted_results), elapsed_ms)

    return {
        "query": query_text,
        "results": formatted_results,
        "latency_ms": elapsed_ms,
        "node_breakdown": {
            "retrieval_ms": elapsed_ms,
        }
    }

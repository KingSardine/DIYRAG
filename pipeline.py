import sys
import logging
from typing import Callable, List, Any

from config import load_config, save_config

# Ensure project root is on path for local imports
from pathlib import Path
ROOT = Path(__file__).resolve().parents[0]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from Ingestion.pdf_ingestion import load_pdf_pages
from PreProcessing.semantic_preprocessing import segment_sentences
from Embedding.semantic_embedding import generate_embeddings, _simple_bag_of_words_embeddings

# Configure root logger for pipeline
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("pipeline")


def _ensure_text(item: Any) -> str:
    if isinstance(item, str):
        return item
    if hasattr(item, "page_content"):
        return getattr(item, "page_content") or ""
    if hasattr(item, "content"):
        return getattr(item, "content") or ""
    return str(item)


def _match_choice(choice: str, options: List[str]) -> str:
    # exact match
    if choice in options:
        return choice
    # numeric index (1-based)
    if choice.isdigit():
        idx = int(choice) - 1
        if 0 <= idx < len(options):
            return options[idx]
    # partial match
    lowered = choice.lower()
    for opt in options:
        if lowered in opt.lower():
            return opt
    return None


def choose(prompt: str, options: List[str], default: str = None) -> str:
    options_str = ", ".join([f"{i+1}:{o}" for i, o in enumerate(options)])
    while True:
        choice = input(f"{prompt} ({options_str}) [{default}]: ").strip()
        if not choice and default is not None:
            logger.info("Choice for '%s' defaulted to %s", prompt, default)
            return default
        matched = _match_choice(choice, options)
        if matched:
            logger.info("Choice for '%s' resolved to %s", prompt, matched)
            return matched
        print("Invalid choice, try again.")


def main():
    cfg = load_config()

    print("--- Pipeline configuration ---")

    # Validate PDF path (file or URL). Re-prompt until valid or default accepted.
    import os
    from urllib.parse import urlparse

    def _is_url(s: str) -> bool:
        try:
            p = urlparse(s)
            return p.scheme in ("http", "https") and p.netloc != ""
        except Exception:
            return False

    while True:
        pdf_path_input = input(f"PDF path [{cfg['pdf_path']}]: ").strip()
        if not pdf_path_input:
            pdf_path = cfg["pdf_path"]
            break
        # if URL or existing file
        if _is_url(pdf_path_input) or os.path.exists(pdf_path_input):
            pdf_path = pdf_path_input
            break
        print(f"Path '{pdf_path_input}' is not a valid file or URL. Try again or press Enter to use default.")

    chunking_options = ["semantic", "fixed", "recursive", "structural", "none"]
    chunking = choose("Chunking strategy", chunking_options, default=cfg.get("chunking", "semantic"))

    preprocess_choice = input(f"Preprocess text before chunking? (y/n) [{'y' if cfg.get('preprocess', True) else 'n'}]: ").strip().lower()
    preprocess = preprocess_choice != "n"

    # Always ask for chunk parameters so the user can tune them even when
    # using chunkers that may ignore the values.
    try:
        chunk_size = int(input(f"Chunk size [{cfg.get('chunk_size', 500)}]: ").strip() or cfg.get('chunk_size', 500))
    except ValueError:
        chunk_size = cfg.get('chunk_size', 500)

    try:
        chunk_overlap = int(input(f"Chunk overlap [{cfg.get('chunk_overlap', 50)}]: ").strip() or cfg.get('chunk_overlap', 50))
    except ValueError:
        chunk_overlap = cfg.get('chunk_overlap', 50)

    # Output format for query results
    output_options = ["snippet", "full"]
    output_format = choose("Output format", output_options, default=cfg.get("output_format", "snippet"))

    try:
        snippet_length = int(input(f"Snippet length [{cfg.get('snippet_length', 400)}]: ").strip() or cfg.get('snippet_length', 400))
    except ValueError:
        snippet_length = cfg.get('snippet_length', 400)

    embedding_options = ["all-MiniLM-L6-v2", "sentence-transformers/all-MiniLM-L6-v2", "bag_of_words"]
    embedding_model = choose("Embedding model", embedding_options, default=cfg.get("embedding_model", "all-MiniLM-L6-v2"))

    retriever_options = ["hybrid", "sparse"]
    retriever_choice = choose("Retriever", retriever_options, default=cfg.get("retriever", "hybrid"))

    try:
        k = int(input(f"Number of results (k) [{cfg.get('k', 5)}]: ").strip() or cfg.get('k', 5))
    except ValueError:
        k = cfg.get('k', 5)

    # Persist config
    cfg_update = dict(cfg)
    cfg_update.update({
        "pdf_path": pdf_path,
        "chunking": chunking,
        "chunk_size": chunk_size,
        "chunk_overlap": chunk_overlap,
        "preprocess": preprocess,
        "embedding_model": embedding_model,
        "retriever": retriever_choice,
        "k": k,
        "output_format": output_format,
        "snippet_length": snippet_length,
    })

    save_config(cfg_update)
    print("Saved configuration to config.yaml")

    # Map chunkers
    chunk_texts: List[str] = []

    # Load pages
    pages = load_pdf_pages(pdf_path)

    # Optional preprocessing
    if preprocess:
        logger.info("Preprocessing pages (sentence segmentation)")
        for p in pages:
            try:
                p.page_content = " ".join(segment_sentences(p.page_content or ""))
            except Exception:
                logger.exception("Error during preprocessing for a page; leaving content unchanged")

    # Chunking
    if chunking == "semantic":
        # semantic_chunking expects text input
        from Chunking.semantic_chunking import semantic_chunking as _semantic_chunking

        full_text = "\n".join(_ensure_text(p) for p in pages)
        chunks = _semantic_chunking(full_text, model_name=embedding_model)
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
        # no chunking: use page texts
        chunk_texts = [_ensure_text(p) for p in pages]

    print(f"Prepared {len(chunk_texts)} text chunks/items for indexing.")

    # Embedding function
    if embedding_model == "bag_of_words":
        embedding_fn: Callable = _simple_bag_of_words_embeddings
    else:
        embedding_fn = lambda texts: generate_embeddings(texts, model_name=embedding_model)

    # Indexing and retrieval binding
    if retriever_choice == "sparse":
        from Retrieval.sparse_retrieval import SparseRetriever

        retriever = SparseRetriever()
        retriever.index(chunk_texts)

        def query_fn(q: str, k: int = 5):
            results, scores = retriever.retrieve(q, k=k)
            # results is shape (1,k)
            return list(results[0]) if results.shape[1] > 0 else [], list(scores[0]) if scores.shape[1] > 0 else []

    else:
        from VectorDB.hybrid_retriever import HybridRetriever

        retriever = HybridRetriever()
        # hybrid retriever builds dense embeddings internally; pass embedding_fn
        retriever.index(chunk_texts, embedding_fn=embedding_fn)

        def query_fn(q: str, k: int = 5):
            return retriever.retrieve(q, k=k)

    # Interactive query loop
    print("\n--- Ready for queries (type 'exit' to quit) ---")
    while True:
        q = input("Query> ").strip()
        if not q or q.lower() in ("exit", "quit"):
            break

        results, scores = query_fn(q, k=k)
        if not results:
            print("No results.")
            continue

        for rank, (doc, score) in enumerate(zip(results, scores), start=1):
            if output_format == "full":
                out_text = doc
            else:
                out_text = doc[:snippet_length]

            print(f"Rank {rank} (score={score:.4f}):\n{out_text}\n---")


if __name__ == "__main__":
    main()

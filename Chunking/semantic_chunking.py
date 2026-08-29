import argparse
import sys
from pathlib import Path
from typing import List

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import logging

from Embedding.semantic_embedding import generate_embeddings
from Ingestion.pdf_ingestion import load_pdf_pages
from PreProcessing.semantic_preprocessing import segment_sentences

logger = logging.getLogger("chunking.semantic")




def calculate_cosine_similarities(embeddings: np.ndarray) -> List[float]:
    """Compute similarity between consecutive sentence embeddings."""
    similarities = []

    for index in range(len(embeddings) - 1):
        vec1 = embeddings[index]
        vec2 = embeddings[index + 1]

        dot_product = np.dot(vec1, vec2)
        norm1 = np.linalg.norm(vec1)
        norm2 = np.linalg.norm(vec2)

        similarity = 0.0 if np.isclose(norm1 * norm2, 0.0) else float(dot_product / (norm1 * norm2))
        similarities.append(similarity)

    return similarities


def detect_breakpoints(similarities: List[float], percentile_threshold: float = 60.0) -> List[int]:
    """Flag sentence boundaries where the semantic distance exceeds a threshold."""
    if not similarities:
        return []

    distances = [1.0 - similarity for similarity in similarities]
    threshold = np.percentile(distances, percentile_threshold)

    return [index for index, distance in enumerate(distances) if distance > threshold]


def aggregate_chunks(sentences: List[str], breakpoints: List[int]) -> List[str]:
    """Group sentences into semantic chunks using detected breakpoints."""
    chunks = []
    current_chunk = []

    for index, sentence in enumerate(sentences):
        current_chunk.append(sentence)

        if index in breakpoints:
            chunks.append(" ".join(current_chunk))
            current_chunk = []

    if current_chunk:
        chunks.append(" ".join(current_chunk))

    return chunks


def semantic_chunking(
    text: str,
    model_name: str = "all-MiniLM-L6-v2",
    percentile_threshold: float = 60.0,
) -> List[str]:
    """Build semantic chunks from raw text using sentence embeddings and breakpoint detection."""
    sentences = segment_sentences(text)

    if not sentences:
        return []
    logger.info("Building embeddings for %d sentences", len(sentences))
    embeddings = generate_embeddings(sentences, model_name=model_name)
    similarities = calculate_cosine_similarities(embeddings)
    breakpoints = detect_breakpoints(similarities, percentile_threshold=percentile_threshold)

    return aggregate_chunks(sentences, breakpoints)


def semantic_chunking_from_pdf(
    pdf_path: str,
    model_name: str = "all-MiniLM-L6-v2",
    percentile_threshold: float = 60.0,
) -> List[str]:
    """Load a PDF, extract text content, and produce semantic chunks."""
    pages = load_pdf_pages(pdf_path)
    text = "\n".join(getattr(page, "page_content", "") for page in pages)
    return semantic_chunking(text, model_name=model_name, percentile_threshold=percentile_threshold)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Create semantic chunks from a PDF")
    parser.add_argument(
        "pdf_path",
        nargs="?",
        default=r"C:\Users\diyam\projects\DiyRAG\ingestables\broadridge.pdf",
        help="Path to the PDF file",
    )
    parser.add_argument(
        "--percentile-threshold",
        type=float,
        default=60.0,
        help="Percentile threshold used for breakpoint detection",
    )
    args = parser.parse_args()

    chunks = semantic_chunking_from_pdf(args.pdf_path, percentile_threshold=args.percentile_threshold)
    print(f"Created {len(chunks)} semantic chunks")

    for index, chunk in enumerate(chunks[:5]):
        print(f"\nChunk {index}")
        print(chunk[:250])

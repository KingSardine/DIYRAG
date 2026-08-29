import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from langchain_text_splitters import RecursiveCharacterTextSplitter
from Ingestion.pdf_ingestion import load_pdf_pages


def recursive_size_chunking(pages, chunk_size, chunk_overlap):
    """
    Split a list of Document objects into meaningful chunks.

    Args:
        pages: List of Document objects.
        chunk_size: Maximum size of each chunk.
        chunk_overlap: Number of overlapping characters between chunks.

    Returns:
        List of chunked Document objects.
    """
    import logging
    logger = logging.getLogger("chunking.recursive")
    logger.info("Recursive chunking: size=%s overlap=%s", chunk_size, chunk_overlap)

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap
    )

    logger.debug(
        "Using recursive chunking with chunk size %s and overlap %s",
        chunk_size,
        chunk_overlap,
    )

    chunks = splitter.split_documents(pages)

    logger.info("Created %d chunks", len(chunks))

    return chunks

# Execute only if run directly, not when imported
if __name__ == "__main__":
     
    import argparse

    parser = argparse.ArgumentParser(
        description="Chunk a PDF using recursive chunking"
    )

    parser.add_argument(
        "pdf_path",
        nargs="?",
        default=r"C:\Users\diyam\projects\DiyRAG\ingestables\broadridge.pdf",
        help="Path to PDF file"
    )

    parser.add_argument(
        "--chunk_size",
        type=int,
        default=500,
        help="Size of each chunk"
    )

    parser.add_argument(
        "--chunk_overlap",
        type=int,
        default=50,
        help="Overlap between chunks"
    )

    args = parser.parse_args()

    pages = load_pdf_pages(args.pdf_path)

    chunks = recursive_size_chunking(
        pages,
        chunk_size=args.chunk_size,
        chunk_overlap=args.chunk_overlap
    )

    print("\nPrinting first 5 chunks in recursive chunking:")

    for i, chunk in enumerate(chunks[:5]):
        print(f"\nChunk {i}")
        print(f"Metadata: {chunk.metadata}")
        print(chunk.page_content[:200])
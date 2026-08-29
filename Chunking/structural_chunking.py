import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import re
from langchain_core.documents import Document
from Ingestion.pdf_ingestion import load_pdf_pages

def structural_chunking(pages):
    import logging
    logger = logging.getLogger("chunking.structural")
    chunks = []

    headings = r'(?=INTRODUCTION|METHODOLOGY|RESULTS|CONCLUSION)'

    for page in pages:
        sections = re.split(headings, page.page_content)

        for section in sections:
            if section.strip():
                chunks.append(
                    Document(
                        page_content=section.strip(),
                        metadata=page.metadata,
                    )
                )

    logger.info("Structural chunking created %d chunks", len(chunks))
    return chunks



# Execute only if run directly, not when imported
if __name__ == "__main__":
     
    import argparse

    parser = argparse.ArgumentParser(
        description="Chunk a PDF using structural chunking"
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

    chunks = structural_chunking(
        pages
    )

    print("\nPrinting first 5 chunks in structural chunking:")

    for i, chunk in enumerate(chunks[:5]):
        print(f"\nChunk {i}")
        print(f"Metadata: {chunk.metadata}")
        print(chunk.page_content[:200])
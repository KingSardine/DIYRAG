# Tests/smoke_chunking_test.py

from pathlib import Path

from Ingestion.pdf_ingestion import load_pdf_pages
from Chunking.fixed_size_chunking import fixed_size_chunking

ROOT = Path(__file__).resolve().parents[1]
pdf_path = ROOT / "ingestables" / "broadridge.pdf"

print("Starting smoke test for fixed_size_chunking...")

# Load pages
pages = load_pdf_pages(str(pdf_path))
print(f"Loaded {len(pages)} pages")

# Chunk pages
chunks = fixed_size_chunking(pages, 500, 50)

print(f"Created {len(chunks)} chunks")

# Inspect first chunk
if chunks:
    print("\nFirst chunk metadata:")
    print(chunks[0].metadata)

    print("\nFirst chunk preview:")
    print(chunks[0].page_content[:200])

print("\nSmoke test for fixed_size_chunking completed successfully!")
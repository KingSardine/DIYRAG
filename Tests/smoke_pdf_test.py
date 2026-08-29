# Tests/smoke_pdf_test.py

from pathlib import Path
from Ingestion.pdf_ingestion import load_pdf_pages

pdf_path = Path(r"C:\Users\diyam\projects\DiyRAG\ingestables\broadridge.pdf")

if not pdf_path.exists():
    raise FileNotFoundError(f"{pdf_path} does not exist")

docs = load_pdf_pages(str(pdf_path))

print(f"Loaded {len(docs)} pages")

# Optional: inspect the first page
print("\nFirst page metadata:")
print(docs[0].metadata)

print("\nFirst page preview:")
print(docs[0].page_content[:200])
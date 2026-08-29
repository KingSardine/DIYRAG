from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from Chunking.semantic_chunking import semantic_chunking
from Ingestion.pdf_ingestion import load_pdf_pages
from PreProcessing.semantic_preprocessing import segment_sentences


def _load_pdf_text():
    pdf_candidates = [
        ROOT / "ingestables" / "broadridge.pdf",
        ROOT / "ingestables" / "Diya Mohapatra_resume9_7.pdf",
    ]
    pdf_path = next((path for path in pdf_candidates if path.exists()), None)

    assert pdf_path is not None, "No PDF file was found in the ingestables folder"

    pages = load_pdf_pages(str(pdf_path))
    assert pages, f"No pages were loaded from {pdf_path}"

    raw_text = "\n".join(page.page_content for page in pages)
    assert raw_text.strip(), f"The PDF at {pdf_path} did not produce any text"

    return pdf_path, raw_text


def test_semantic_chunking_smoke():
    pdf_path, raw_text = _load_pdf_text()
    sentences = segment_sentences(raw_text)

    assert sentences, "The PDF text did not produce any sentences"

    chunks = semantic_chunking(raw_text, percentile_threshold=60.0)

    assert isinstance(chunks, list)
    assert len(chunks) >= 1
    assert all(isinstance(chunk, str) and chunk.strip() for chunk in chunks)

    print(f"Loaded {pdf_path.name} and produced {len(sentences)} sentences -> {len(chunks)} semantic chunks")


if __name__ == "__main__":
    test_semantic_chunking_smoke()
    print("semantic chunking smoke test passed")

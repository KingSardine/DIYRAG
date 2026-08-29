from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from Retrieval.sparse_retrieval import SparseRetriever, SimpleBM25, _default_tokenize
from Ingestion.pdf_ingestion import load_pdf_pages


def _load_pdf_corpus():
    """Load corpus from PDF file."""
    pdf_candidates = [
        ROOT / "ingestables" / "broadridge.pdf",
        ROOT / "ingestables" / "Diya Mohapatra_resume9_7.pdf",
    ]
    pdf_path = next((path for path in pdf_candidates if path.exists()), None)

    if pdf_path is None:
        raise FileNotFoundError("No PDF file found in ingestables folder")

    pages = load_pdf_pages(str(pdf_path))
    if not pages:
        raise ValueError(f"No pages loaded from {pdf_path}")

    # Extract text from each page as separate corpus item
    corpus = [page.page_content for page in pages if page.page_content.strip()]
    return corpus, pdf_path.name


def test_sparse_retriever_with_example_corpus():
    """Test SparseRetriever using corpus loaded from PDF."""
    corpus, pdf_name = _load_pdf_corpus()

    stemmer = lambda s: s
    retriever = SparseRetriever(stopwords="en", stemmer=stemmer)
    retriever.index(corpus)

    query = "Tell me about the business and financial information"
    results, scores = retriever.retrieve(query, k=2)

    assert results.shape == (1, 2), f"Expected shape (1, 2), got {results.shape}"
    assert scores.shape == (1, 2), f"Expected shape (1, 2), got {scores.shape}"
    assert isinstance(results[0, 0], str), "Result should be a string"
    assert isinstance(scores[0, 0], float), "Score should be a float"
    print(f"✓ Retrieved top 2 documents from {pdf_name} ({len(corpus)} pages)")


def test_tokenize_basic():
    """Test basic tokenization with _default_tokenize."""
    text = "Hello World! This is a test."
    tokens = _default_tokenize(text, stemmer=None, stopwords=None)
    assert isinstance(tokens, list), "Tokens should be a list"
    assert "hello" in tokens, "Expected 'hello' in tokens"
    assert "world" in tokens, "Expected 'world' in tokens"
    print("✓ Basic tokenization works")


def test_tokenize_with_stopwords():
    """Test _default_tokenize with stopword removal."""
    text = "The quick brown fox jumps over the lazy dog"
    stopwords = {"the", "over"}
    tokens = _default_tokenize(text, stemmer=None, stopwords=stopwords)
    assert "the" not in tokens, "Stopword 'the' should be removed"
    assert "over" not in tokens, "Stopword 'over' should be removed"
    assert "quick" in tokens, "Expected 'quick' in tokens"
    print("✓ Stopword removal works")


def test_simple_bm25_indexing():
    """Test SimpleBM25 indexing and initialization."""
    tokenized_docs = [
        ["data", "engineering", "pipeline"],
        ["astronomy", "stars", "galaxies"],
        ["deep", "learning", "gpu"],
    ]
    bm25 = SimpleBM25()
    bm25.index(tokenized_docs)
    assert bm25.N == 3, f"Expected N=3, got {bm25.N}"
    assert bm25.avgdl > 0, "Average document length should be positive"
    assert len(bm25.doc_freq) > 0, "Document frequency dict should be populated"
    print(f"✓ SimpleBM25 indexing works: N={bm25.N}, avgdl={bm25.avgdl:.2f}")


def test_simple_bm25_scoring():
    """Test SimpleBM25 scoring with get_scores."""
    tokenized_docs = [
        ["data", "engineering", "pipeline"],
        ["astronomy", "stars", "galaxies"],
        ["deep", "learning", "gpu"],
    ]
    bm25 = SimpleBM25()
    bm25.index(tokenized_docs)

    query_tokens = ["stars", "astronomy"]
    scores = bm25.get_scores(query_tokens)
    assert len(scores) == 3, f"Expected 3 scores, got {len(scores)}"
    assert scores[1] > 0, "Second document should have non-zero score for astronomy query"
    print(f"✓ SimpleBM25 scoring works: scores={scores}")


def test_sparse_retriever_init_with_stopwords():
    """Test SparseRetriever initialization with 'en' stopwords."""
    retriever = SparseRetriever(stopwords="en", stemmer=None)
    assert retriever.stopwords is not None, "Stopwords should be initialized"
    assert isinstance(retriever.stopwords, set), "Stopwords should be a set"
    assert len(retriever.stopwords) > 0, "English stopwords should not be empty"
    print(f"✓ SparseRetriever initialized with {len(retriever.stopwords)} stopwords")


def test_sparse_retriever_index_multiple_documents():
    """Test SparseRetriever indexing multiple documents."""
    corpus = [
        "Data engineering relies on pipelines",
        "Astronomy studies stars",
        "Deep learning uses GPUs",
    ]
    retriever = SparseRetriever(stopwords="en")
    retriever.index(corpus)
    assert len(retriever._raw_docs) == len(corpus), f"Expected {len(corpus)} docs, got {len(retriever._raw_docs)}"
    print(f"✓ SparseRetriever indexed {len(retriever._raw_docs)} documents")


def test_sparse_retriever_retrieve_with_k():
    """Test SparseRetriever retrieve with k parameter."""
    corpus = [
        "Data engineering relies on robust ETL pipelines.",
        "Astronomy studies planets, stars, and celestial galaxies.",
        "Deep learning models require powerful GPUs and massive compute.",
        "Python is popular for data analysis and machine learning tasks.",
    ]
    retriever = SparseRetriever(stopwords="en")
    retriever.index(corpus)

    query = "stars planets galaxies"
    results, scores = retriever.retrieve(query, k=2)

    assert results.shape[1] == 2, f"Expected k=2 results, got {results.shape[1]}"
    assert "Astronomy" in results[0, 0], "Top result should mention astronomy"
    print(f"✓ Retrieved top {results.shape[1]} documents for query")


def test_sparse_retriever_retrieve_returns_correct_format():
    """Test that retrieve returns numpy arrays with correct format."""
    corpus = [
        "Data engineering relies on robust ETL pipelines.",
        "Astronomy studies planets, stars, and celestial galaxies.",
    ]
    retriever = SparseRetriever(stopwords="en")
    retriever.index(corpus)

    results, scores = retriever.retrieve("astronomy", k=1)

    assert results.shape == (1, 1), f"Expected shape (1, 1), got {results.shape}"
    assert scores.shape == (1, 1), f"Expected shape (1, 1), got {scores.shape}"
    assert scores[0, 0] >= 0, "Scores should be non-negative"
    print(f"✓ Retrieve returns correct format: results.shape={results.shape}, scores.shape={scores.shape}")


def test_sparse_retriever_with_custom_chunking():
    """Test SparseRetriever with custom chunking function."""
    docs = ["This is doc one. This is doc two."]

    def simple_chunker(docs):
        """Split docs by period."""
        chunks = []
        for doc in docs:
            chunks.extend([c.strip() for c in doc.split(".") if c.strip()])
        return chunks

    retriever = SparseRetriever(stopwords="en")
    retriever.index(docs, chunking_fn=simple_chunker)

    assert len(retriever._raw_docs) >= 2, "Chunking should produce at least 2 documents"
    print(f"✓ Custom chunking produced {len(retriever._raw_docs)} chunks")


if __name__ == "__main__":
    test_sparse_retriever_with_example_corpus()
    test_tokenize_basic()
    test_tokenize_with_stopwords()
    test_simple_bm25_indexing()
    test_simple_bm25_scoring()
    test_sparse_retriever_init_with_stopwords()
    test_sparse_retriever_index_multiple_documents()
    test_sparse_retriever_retrieve_with_k()
    test_sparse_retriever_retrieve_returns_correct_format()
    test_sparse_retriever_with_custom_chunking()

    print("\n✅ All tests passed!")

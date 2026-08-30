# DiyRAG — Pipeline Demo

This repository contains small building blocks for a Retrieval-Augmented system: ingestion, preprocessing, chunking, embedding, and retrieval.

## `pipeline.py` (Interactive demo)

Run `pipeline.py` to interactively choose pipeline components and run an end-to-end flow:

- Load a PDF (`ingestables/broadridge.pdf` by default)
- Optionally preprocess text (sentence segmentation)
- Choose chunking strategy: `semantic`, `fixed`, `recursive`, `structural`, or `none`
- Choose embedding: `all-MiniLM-L6-v2` (default), or `bag_of_words` (lightweight fallback)
- Choose retriever: `hybrid` (dense + sparse) or `sparse` (BM25)

Additional prompts
- `chunk_size` and `chunk_overlap` are now prompted every run so you can tune them even when a chunker may ignore them.
- `output_format`: choose `snippet` or `full` for query results; `snippet_length` controls snippet size.

The script persists choices in `config.yaml` so subsequent runs reuse your selections.

Usage:

```bash
python -m pipeline
```

Then follow prompts in the terminal. After indexing, you can enter free-text queries and view top-k results.

## 🌐 Custom RAG Sandbox & Diagnostic Tool (Web UI)

The full interactive web application is located in the [`Frontend/`](Frontend/) directory.

### Quick Start:

1. **Run Frontend (Dev Mode):**
   ```bash
   cd Frontend
   npm install
   npm run dev
   ```
   Open `http://localhost:3000` in your browser.

2. **Run Fullstack Server (FastAPI + Built Frontend):**
   ```bash
   python run.py
   ```

### Features:
- **1. Step Config Panel:** Configure Ingestion (with custom PDF file upload, URL, or preloaded documents), Sentence Segmentation Preprocessing, Chunking (Recursive, Semantic, Fixed, Structural), Embedding, VectorDB, and Retrieval.
- **2. Live Pipeline Flow Canvas:** Interactive animated node graph with speed & throughput metrics (`Speed: 2.1 MB/s`, `342 Chunks/sec`) and glowing data particle streams.
- **3. Query & Diagnostic Playground:** Test search queries with live similarity scores, snippet/full previews, and node latency breakdown.
- **4. Real-Time Backend Log Stream & Terminal:** Color-coded log streaming with millisecond timestamps and interactive `Query>` command prompt for bidirectional terminal input.
- **5. Compare System Mode:** Side-by-side comparative benchmarking for CompA vs CompB dual configurations.

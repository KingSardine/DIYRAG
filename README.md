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

## Future website

Goal: build an interactive web-based dashboard (similar to the attached mock) showing live pipeline flow, comparative analytics, and real-time logs. For now, `pipeline.py` is designed with that future UI in mind — it centralizes configuration and exposes a simple interactive flow you can later hook to a web frontend.

import json
from pathlib import Path
from typing import Any, Dict

try:
    import yaml
except Exception:  # pragma: no cover - best-effort import
    yaml = None
import logging

logger = logging.getLogger("config")


DEFAULT_CONFIG: Dict[str, Any] = {
    "pdf_path": "ingestables/broadridge.pdf",
    "chunking": "semantic",  # options: semantic, fixed, recursive, structural, none
    "chunk_size": 500,
    "chunk_overlap": 50,
    "preprocess": True,
    "embedding_model": "all-MiniLM-L6-v2",  # or 'bag_of_words'
    "retriever": "hybrid",  # options: hybrid, sparse
    "k": 5,
}


def load_config(path: str = "config.yaml") -> Dict[str, Any]:
    p = Path(path)
    if not p.exists():
        return dict(DEFAULT_CONFIG)

    text = p.read_text(encoding="utf-8")
    # Prefer YAML when available
    if yaml is not None:
        try:
            data = yaml.safe_load(text)
            if data is None:
                return dict(DEFAULT_CONFIG)
            cfg = dict(DEFAULT_CONFIG)
            cfg.update(data)
            logger.info("Loaded configuration from %s", path)
            return cfg
        except Exception:
            pass

    # Fallback to JSON
    try:
        data = json.loads(text)
        cfg = dict(DEFAULT_CONFIG)
        cfg.update(data)
        logger.info("Loaded configuration (JSON fallback) from %s", path)
        return cfg
    except Exception:
        return dict(DEFAULT_CONFIG)


def save_config(config: Dict[str, Any], path: str = "config.yaml") -> None:
    p = Path(path)
    if yaml is not None:
        try:
            with p.open("w", encoding="utf-8") as fh:
                yaml.safe_dump(config, fh, sort_keys=False)
            logger.info("Saved configuration to %s (yaml)", path)
            return
        except Exception:
            pass

    # Fallback JSON
    p.write_text(json.dumps(config, indent=2), encoding="utf-8")
    logger.info("Saved configuration to %s (json)", path)


if __name__ == "__main__":
    print("Current config:\n")
    cfg = load_config()
    print(cfg)
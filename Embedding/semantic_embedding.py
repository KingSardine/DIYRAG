import re
import logging
from typing import List, Dict, Optional

import numpy as np

logger = logging.getLogger("embedding")

try:
    from sentence_transformers import SentenceTransformer
except Exception:  # pragma: no cover - fallback for environments without the package
    SentenceTransformer = None

# Global shared vocabulary for fallback bag-of-words
_GLOBAL_BOW_VOCAB: Dict[str, int] = {}

def _simple_bag_of_words_embeddings(sentences: List[str], token_map: Optional[Dict[str, int]] = None) -> np.ndarray:
    """Create deterministic fallback embeddings when sentence-transformers is unavailable."""
    global _GLOBAL_BOW_VOCAB
    if not sentences:
        return np.empty((0, 0), dtype=float)

    token_pattern = re.compile(r"[a-zA-Z0-9']+")

    if token_map is None:
        if not _GLOBAL_BOW_VOCAB:
            # Build vocabulary from sentences
            vocab = []
            token_map = {}
            for sentence in sentences:
                for token in token_pattern.findall(str(sentence).lower()):
                    if token not in token_map:
                        token_map[token] = len(vocab)
                        vocab.append(token)
            _GLOBAL_BOW_VOCAB = token_map
        else:
            token_map = _GLOBAL_BOW_VOCAB

    vocab_size = max(1, len(token_map))
    vectors = np.zeros((len(sentences), vocab_size), dtype=float)

    for index, sentence in enumerate(sentences):
        counts = {}
        for token in token_pattern.findall(str(sentence).lower()):
            counts[token] = counts.get(token, 0) + 1

        for token, count in counts.items():
            if token in token_map:
                vectors[index, token_map[token]] = count

    return vectors


def generate_embeddings(sentences: List[str], model_name: str = "all-MiniLM-L6-v2") -> np.ndarray:
    """Generate sentence embeddings, preferring sentence-transformers when available."""
    if not sentences:
        return np.empty((0, 0), dtype=float)
    if SentenceTransformer is not None:
        try:
            logger.info("Using SentenceTransformer model: %s", model_name)
            model = SentenceTransformer(model_name)
            return np.asarray(model.encode(sentences), dtype=float)
        except Exception:
            logger.exception("SentenceTransformer failed; falling back to bag-of-words")

    logger.info("Using bag-of-words fallback embeddings")
    return _simple_bag_of_words_embeddings(sentences)
